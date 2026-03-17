/**
 * Authentication Service
 */

import {
  Injectable,
  UnauthorizedException,
  ConflictException,
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
import { RegisterDto } from "./dto/register.dto";

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

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 12;
  private readonly MAX_FAILED_LOGIN_ATTEMPTS = 5;
  private readonly LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
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
   * Register new admin user
   */
  async register(
    dto: RegisterDto,
  ): Promise<{ user: User; tokens: AuthTokens }> {
    // Check if email already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException("Email already registered");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // Create user
    const user = this.userRepository.create({
      email: dto.email.toLowerCase(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      password: hashedPassword,
      phone: dto.phone,
      role: UserRole.GENERAL_MANAGER, // New registrations are general managers
      isActive: true,
    });

    await this.userRepository.save(user);

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Save refresh token
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return { user, tokens };
  }

  /**
   * Login user
   */
  async login(dto: LoginDto): Promise<{ user: User; tokens: AuthTokens }> {
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
      const fallbackExp = this.currentUnixTimestamp() + this.accessTokenTtlSeconds();
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
    return Math.max(1, Math.floor(this.parseExpiresIn(this.accessExpiresIn) / 1000));
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
}
