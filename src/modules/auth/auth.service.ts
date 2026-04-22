/**
 * Authentication Service
 */

import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { createHash, randomUUID } from "crypto";
import { User, UserRole } from "../../entities";
import { LoginDto } from "./dto/login.dto";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  managerId?: string;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
  jti?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export type LoginResult =
  | { user: User; tokens: AuthTokens }
  | { requiresEmailVerification: true; email: string };

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 12;
  private readonly MAX_FAILED_LOGIN_ATTEMPTS = 5;
  private readonly LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
  private readonly EMAIL_VERIFICATION_OTP_TTL_MS = 15 * 60 * 1000;
  private readonly EMAIL_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;
  private readonly loginAttemptState = new Map<
    string,
    { count: number; lockedUntil?: number }
  >();
  private readonly revokedAccessTokens = new Map<string, number>();
  private readonly userTokenVersion = new Map<string, number>();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.accessExpiresIn =
      this.configService.get<string>("jwt.accessExpiresIn") ?? "15m";
    this.refreshExpiresIn =
      this.configService.get<string>("jwt.refreshExpiresIn") ?? "7d";
  }

  /**
   * Verify a JWT token (checks signature + expiry) and return its payload.
   * Used by the controller to extract and validate userId from the refresh token.
   */
  verifyToken(token: string): JwtPayload {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>("jwt.secret"),
      });
      if (!payload || !payload.sub) {
        throw new UnauthorizedException("Invalid token payload");
      }
      return payload as JwtPayload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("Invalid or expired token");
    }
  }

  /**
   * Login user
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    const loginKey = dto.email.toLowerCase().trim();
    this.assertLoginNotLocked(loginKey);

    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      this.registerFailedLogin(loginKey);
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("Account is deactivated");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      this.registerFailedLogin(loginKey);
      throw new UnauthorizedException("Invalid credentials");
    }

    // Successful login resets failed-attempt counter
    this.loginAttemptState.delete(loginKey);

    if (user.role === UserRole.TENANT && !user.emailVerifiedAt) {
      await this.issueEmailVerificationOtp(user);
      return { requiresEmailVerification: true, email: user.email };
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Update refresh token and last login
    const hashedRefreshToken = await this.hashRefreshToken(tokens.refreshToken);
    await this.userRepository.update(user.id, {
      refreshToken: hashedRefreshToken,
      lastLoginAt: new Date(),
    });

    return { user, tokens };
  }

  private assertLoginNotLocked(loginKey: string): void {
    const state = this.loginAttemptState.get(loginKey);
    if (!state?.lockedUntil) {
      return;
    }

    if (state.lockedUntil > Date.now()) {
      throw new HttpException(
        "Too many failed login attempts. Please try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.loginAttemptState.delete(loginKey);
  }

  private registerFailedLogin(loginKey: string): void {
    const existing = this.loginAttemptState.get(loginKey) ?? { count: 0 };
    const nextCount = existing.count + 1;

    if (nextCount >= this.MAX_FAILED_LOGIN_ATTEMPTS) {
      this.loginAttemptState.set(loginKey, {
        count: nextCount,
        lockedUntil: Date.now() + this.LOGIN_LOCKOUT_MS,
      });

      throw new HttpException(
        "Too many failed login attempts. Please try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.loginAttemptState.set(loginKey, { count: nextCount });
  }

  /**
   * Logout user
   */
  async logout(
    userId: string,
    accessTokenJti?: string,
    accessTokenExp?: number,
  ): Promise<void> {
    await this.userRepository.update(userId, { refreshToken: null });

    if (accessTokenJti) {
      const fallbackExp =
        this.currentUnixTimestamp() + this.accessTokenTtlSeconds();
      this.revokeAccessToken(accessTokenJti, accessTokenExp ?? fallbackExp);
    }
  }

  /**
   * Refresh access token
   */
  async refreshTokens(
    userId: string,
    refreshToken: string,
  ): Promise<AuthTokens> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // Verify refresh token
    const isValid = await bcrypt.compare(
      this.normalizeTokenForHash(refreshToken),
      user.refreshToken,
    );
    if (!isValid) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // Generate new tokens
    const tokens = await this.generateTokens(user);

    // Update refresh token
    await this.updateRefreshToken(userId, tokens.refreshToken);

    return tokens;
  }

  /**
   * Generate JWT tokens
   */
  private async generateTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      managerId: user.managerId,
      tokenVersion: this.userTokenVersion.get(user.id) ?? 0,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: this.accessExpiresIn as any,
        secret: this.configService.getOrThrow<string>("jwt.secret"),
        jwtid: randomUUID(),
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: this.refreshExpiresIn as any,
        secret: this.configService.getOrThrow<string>("jwt.secret"),
        jwtid: randomUUID(),
      }),
    ]);

    // Calculate expiration time
    const expiresAt = Date.now() + this.parseExpiresIn(this.accessExpiresIn);

    return { accessToken, refreshToken, expiresAt };
  }

  /**
   * Update refresh token in database
   */
  private async updateRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const hashedToken = await this.hashRefreshToken(refreshToken);
    await this.userRepository.update(userId, { refreshToken: hashedToken });
  }

  private normalizeTokenForHash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async hashRefreshToken(refreshToken: string): Promise<string> {
    return bcrypt.hash(
      this.normalizeTokenForHash(refreshToken),
      this.SALT_ROUNDS,
    );
  }

  /**
   * Parse expiration time string to milliseconds
   */
  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 900000; // Default 15 minutes

    const value = parseInt(match[1] ?? "15", 10);
    const unit = match[2];

    switch (unit) {
      case "s":
        return value * 1000;
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      case "d":
        return value * 24 * 60 * 60 * 1000;
      default:
        return 900000;
    }
  }

  private accessTokenTtlSeconds(): number {
    return Math.max(
      1,
      Math.floor(this.parseExpiresIn(this.accessExpiresIn) / 1000),
    );
  }

  private currentUnixTimestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  private pruneRevocationState(now: number): void {
    for (const [jti, exp] of this.revokedAccessTokens.entries()) {
      if (exp < now) {
        this.revokedAccessTokens.delete(jti);
      }
    }
  }

  private revokeAccessToken(jti: string, exp: number): void {
    const now = this.currentUnixTimestamp();
    this.pruneRevocationState(now);

    if (exp <= now) {
      return;
    }

    this.revokedAccessTokens.set(jti, exp);
  }

  private invalidateAllUserTokens(userId: string): void {
    const current = this.userTokenVersion.get(userId) ?? 0;
    this.userTokenVersion.set(userId, current + 1);
  }

  isAccessTokenRevoked(payload: JwtPayload): boolean {
    const now = this.currentUnixTimestamp();
    this.pruneRevocationState(now);

    if (!payload.jti) {
      return true;
    }

    const revokedExp = this.revokedAccessTokens.get(payload.jti);
    if (revokedExp && revokedExp >= now) {
      return true;
    }

    const currentVersion = this.userTokenVersion.get(payload.sub) ?? 0;
    const payloadVersion = payload.tokenVersion ?? 0;
    return payloadVersion !== currentVersion;
  }

  /**
   * Validate user by ID
   */
  async validateUser(userId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId, isActive: true },
    });
  }

  /**
   * Change password
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException("User not found");
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      throw new BadRequestException("Current password is incorrect");
    }

    const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    await this.userRepository.update(userId, {
      password: hashedPassword,
      refreshToken: null,
    });
    this.invalidateAllUserTokens(userId);
  }

  /**
   * Update FCM token
   */
  async updateFcmToken(userId: string, fcmToken: string): Promise<void> {
    await this.userRepository.update(userId, { fcmToken });
  }

  /**
   * Forgot password — generate OTP and send via email
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Don't reveal whether email exists
      return;
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash the OTP for storage
    const hashedOtp = await bcrypt.hash(otp, this.SALT_ROUNDS);

    // Store OTP with 15 minute expiry
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.userRepository.update(user.id, {
      resetOtp: hashedOtp,
      resetOtpExpiresAt: expiresAt,
    });

    // Send OTP via email
    await this.sendOtpEmail(user.email, otp, user.firstName);
  }

  /**
   * Reset password using OTP
   */
  async resetPassword(
    email: string,
    otp: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });

    if (!user || !user.resetOtp || !user.resetOtpExpiresAt) {
      throw new BadRequestException(
        "Invalid or expired reset code. Please request a new one.",
      );
    }

    // Check if OTP has expired
    if (new Date() > user.resetOtpExpiresAt) {
      // Clear expired OTP
      await this.userRepository.update(user.id, {
        resetOtp: null,
        resetOtpExpiresAt: null,
      });
      throw new BadRequestException(
        "Reset code has expired. Please request a new one.",
      );
    }

    // Verify OTP
    const isOtpValid = await bcrypt.compare(otp, user.resetOtp);
    if (!isOtpValid) {
      throw new BadRequestException(
        "Invalid reset code. Please check and try again.",
      );
    }

    // Hash new password and clear OTP
    const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    await this.userRepository.update(user.id, {
      password: hashedPassword,
      resetOtp: null,
      resetOtpExpiresAt: null,
      refreshToken: null,
    });

    // Invalidate all existing tokens
    this.invalidateAllUserTokens(user.id);
  }

  /**
   * Request email verification OTP for tenant accounts
   */
  async requestEmailVerification(
    email: string,
    password?: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });

    if (!user || user.role !== UserRole.TENANT) {
      // Don't reveal whether email exists
      return;
    }

    if (!user.isActive) {
      throw new UnauthorizedException("Account is deactivated");
    }

    if (password) {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException("Invalid credentials");
      }
    }

    if (user.emailVerifiedAt) {
      return;
    }

    await this.issueEmailVerificationOtp(user);
  }

  /**
   * Verify email OTP for tenant accounts
   */
  async verifyEmailOtp(email: string, otp: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });

    if (!user || user.role !== UserRole.TENANT) {
      throw new BadRequestException("Invalid verification request");
    }

    if (user.emailVerifiedAt) {
      return;
    }

    if (!user.emailVerificationOtp || !user.emailVerificationOtpExpiresAt) {
      throw new BadRequestException("Invalid or expired verification code");
    }

    if (new Date() > user.emailVerificationOtpExpiresAt) {
      await this.userRepository.update(user.id, {
        emailVerificationOtp: null,
        emailVerificationOtpExpiresAt: null,
      });
      throw new BadRequestException("Verification code has expired");
    }

    const isOtpValid = await bcrypt.compare(otp, user.emailVerificationOtp);
    if (!isOtpValid) {
      throw new BadRequestException("Invalid verification code");
    }

    await this.userRepository.update(user.id, {
      emailVerifiedAt: new Date(),
      emailVerificationOtp: null,
      emailVerificationOtpExpiresAt: null,
      emailVerificationSentAt: null,
    });
  }

  private async issueEmailVerificationOtp(user: User): Promise<void> {
    const now = Date.now();
    const lastSentAt = user.emailVerificationSentAt?.getTime() ?? 0;
    const otpStillValid =
      user.emailVerificationOtpExpiresAt &&
      user.emailVerificationOtpExpiresAt > new Date();

    if (otpStillValid && now - lastSentAt < this.EMAIL_OTP_RESEND_COOLDOWN_MS) {
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, this.SALT_ROUNDS);
    const expiresAt = new Date(now + this.EMAIL_VERIFICATION_OTP_TTL_MS);

    await this.userRepository.update(user.id, {
      emailVerificationOtp: hashedOtp,
      emailVerificationOtpExpiresAt: expiresAt,
      emailVerificationSentAt: new Date(),
    });

    await this.sendEmailVerificationOtp(user.email, otp, user.firstName);
  }

  /**
   * Send OTP via email using nodemailer
   * Falls back to console logging if email is not configured
   */
  private async sendOtpEmail(
    email: string,
    otp: string,
    firstName: string,
  ): Promise<void> {
    const smtpHost = this.configService.get<string>("SMTP_HOST");
    const smtpPort = this.configService.get<number>("SMTP_PORT");
    const smtpUser = this.configService.get<string>("SMTP_USER");
    const smtpPass = this.configService.get<string>("SMTP_PASS");
    const smtpFrom =
      this.configService.get<string>("SMTP_FROM") ||
      "noreply@rentmanagement.com";

    if (!smtpHost || !smtpUser || !smtpPass) {
      // Fallback: log OTP to console for dev/testing
      console.log(`\n========================================`);
      console.log(`  PASSWORD RESET OTP for ${email}`);
      console.log(`  Code: ${otp}`);
      console.log(`  Expires in 15 minutes`);
      console.log(`========================================\n`);
      return;
    }

    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort || 587,
        secure: (smtpPort || 587) === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: smtpFrom,
        to: email,
        subject: "Password Reset Code — Rent Management",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1a73e8; margin-bottom: 16px;">Password Reset</h2>
            <p>Hi ${firstName},</p>
            <p>You requested a password reset. Use the code below to reset your password:</p>
            <div style="background: #f0f4ff; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1a73e8;">${otp}</span>
            </div>
            <p style="color: #666; font-size: 14px;">This code expires in <strong>15 minutes</strong>.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 12px;">Rent Management System</p>
          </div>
        `,
      });
    } catch (error) {
      console.error("Failed to send OTP email:", error);
      // Still log OTP to console as fallback
      console.log(`PASSWORD RESET OTP for ${email}: ${otp}`);
    }
  }

  private async sendEmailVerificationOtp(
    email: string,
    otp: string,
    firstName: string,
  ): Promise<void> {
    const smtpHost = this.configService.get<string>("SMTP_HOST");
    const smtpPort = this.configService.get<number>("SMTP_PORT");
    const smtpUser = this.configService.get<string>("SMTP_USER");
    const smtpPass = this.configService.get<string>("SMTP_PASS");
    const smtpFrom =
      this.configService.get<string>("SMTP_FROM") ||
      "noreply@rentmanagement.com";

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.log(`\n========================================`);
      console.log(`  EMAIL VERIFICATION OTP for ${email}`);
      console.log(`  Code: ${otp}`);
      console.log(`  Expires in 15 minutes`);
      console.log(`========================================\n`);
      return;
    }

    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort || 587,
        secure: (smtpPort || 587) === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: smtpFrom,
        to: email,
        subject: "Verify Your Email — Rent Management",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1a73e8; margin-bottom: 16px;">Verify Your Email</h2>
            <p>Hi ${firstName},</p>
            <p>Use the code below to verify your email address:</p>
            <div style="background: #f0f4ff; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1a73e8;">${otp}</span>
            </div>
            <p style="color: #666; font-size: 14px;">This code expires in <strong>15 minutes</strong>.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 12px;">Rent Management System</p>
          </div>
        `,
      });
    } catch (error) {
      console.error("Failed to send verification OTP email:", error);
      console.log(`EMAIL VERIFICATION OTP for ${email}: ${otp}`);
    }
  }
}
