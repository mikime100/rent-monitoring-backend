/**
 * Visitor Service
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";
import { ConfigService } from "@nestjs/config";
import {
  TenantAccount,
  VisitorInviteLink,
  VisitorInviteStatus,
  VisitorPass,
  VisitorPassStatus,
  VisitorVerificationLog,
  VisitorVerificationAction,
  VisitorVerificationChannel,
} from "../../entities";
import { CreateVisitorInviteLinkDto } from "./dto/create-visitor-invite-link.dto";
import { CreateVisitorPassDto } from "./dto/create-visitor-pass.dto";
import { VerifyVisitorPassDto } from "./dto/verify-visitor-pass.dto";

@Injectable()
export class VisitorService {
  private readonly SALT_ROUNDS = 12;
  private readonly CODE_TTL_MS = 24 * 60 * 60 * 1000;
  private readonly LINK_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(TenantAccount)
    private readonly tenantAccountRepository: Repository<TenantAccount>,
    @InjectRepository(VisitorInviteLink)
    private readonly visitorInviteRepository: Repository<VisitorInviteLink>,
    @InjectRepository(VisitorPass)
    private readonly visitorPassRepository: Repository<VisitorPass>,
    @InjectRepository(VisitorVerificationLog)
    private readonly visitorLogRepository: Repository<VisitorVerificationLog>,
    private readonly configService: ConfigService,
  ) {}

  private async getActiveAccount(userId: string): Promise<TenantAccount> {
    const account = await this.tenantAccountRepository.findOne({
      where: { userId, isActive: true },
    });

    if (!account) {
      throw new NotFoundException("Tenant account not found");
    }

    return account;
  }

  private generateShareToken(): string {
    return randomBytes(20).toString("hex");
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async sendVisitorCodeEmail(
    email: string,
    code: string,
    visitorName: string,
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
      console.log(`  VISITOR CODE for ${email}`);
      console.log(`  Code: ${code}`);
      console.log(`  Expires in 24 hours`);
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
        subject: "Visitor Access Code — Rent Management",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1a73e8; margin-bottom: 16px;">Visitor Access Code</h2>
            <p>Hello ${visitorName},</p>
            <p>Use the code below to access the property:</p>
            <div style="background: #f0f4ff; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1a73e8;">${code}</span>
            </div>
            <p style="color: #666; font-size: 14px;">This code expires in <strong>24 hours</strong>.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 12px;">Rent Management System</p>
          </div>
        `,
      });
    } catch (error) {
      console.error("Failed to send visitor code email:", error);
      console.log(`VISITOR CODE for ${email}: ${code}`);
    }
  }

  async createInviteLink(
    userId: string,
    dto: CreateVisitorInviteLinkDto,
  ): Promise<{ link: VisitorInviteLink; shareToken: string }> {
    const account = await this.getActiveAccount(userId);

    const shareToken = this.generateShareToken();
    const shareTokenHash = this.hashToken(shareToken);
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + this.LINK_TTL_MS);

    if (Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException("Invalid expiresAt value");
    }

    const link = this.visitorInviteRepository.create({
      tenantAccountId: account.id,
      propertyId: account.propertyId,
      unitNumber: account.unitNumber,
      shareTokenHash,
      expiresAt,
      status: VisitorInviteStatus.ACTIVE,
    });

    const saved = await this.visitorInviteRepository.save(link);
    return { link: saved, shareToken };
  }

  async createPass(
    userId: string,
    inviteLinkId: string,
    dto: CreateVisitorPassDto,
  ): Promise<{ pass: VisitorPass; verificationCode: string }> {
    const account = await this.getActiveAccount(userId);

    const link = await this.visitorInviteRepository.findOne({
      where: { id: inviteLinkId },
    });

    if (!link) {
      throw new NotFoundException("Invite link not found");
    }

    if (link.tenantAccountId !== account.id) {
      throw new ForbiddenException("Access denied to this invite link");
    }

    if (link.status !== VisitorInviteStatus.ACTIVE) {
      throw new BadRequestException("Invite link is not active");
    }

    if (new Date() > link.expiresAt) {
      link.status = VisitorInviteStatus.EXPIRED;
      await this.visitorInviteRepository.save(link);
      throw new BadRequestException("Invite link has expired");
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(code, this.SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + this.CODE_TTL_MS);

    const pass = this.visitorPassRepository.create({
      inviteLinkId: link.id,
      visitorName: dto.visitorName,
      visitorPhone: dto.visitorPhone,
      visitorEmail: dto.visitorEmail,
      idNumber: dto.idNumber,
      vehiclePlate: dto.vehiclePlate,
      photoUrl: dto.photoUrl,
      verificationCodeHash: codeHash,
      verificationCodeExpiresAt: expiresAt,
      status: VisitorPassStatus.PENDING,
    });

    const saved = await this.visitorPassRepository.save(pass);

    if (dto.visitorEmail) {
      await this.sendVisitorCodeEmail(dto.visitorEmail, code, dto.visitorName);
    }

    return { pass: saved, verificationCode: code };
  }

  async verifyPass(
    guardUserId: string,
    dto: VerifyVisitorPassDto,
  ): Promise<{ verified: boolean; pass: VisitorPass | null }> {
    const pass = await this.visitorPassRepository.findOne({
      where: { id: dto.passId },
    });

    if (!pass) {
      throw new NotFoundException("Visitor pass not found");
    }

    if (pass.status === VisitorPassStatus.REVOKED) {
      throw new BadRequestException("Visitor pass is revoked");
    }

    if (pass.status === VisitorPassStatus.EXPIRED) {
      await this.logAttempt(
        pass.id,
        guardUserId,
        dto,
        VisitorVerificationAction.DENIED,
      );
      return { verified: false, pass };
    }

    if (new Date() > pass.verificationCodeExpiresAt) {
      pass.status = VisitorPassStatus.EXPIRED;
      await this.visitorPassRepository.save(pass);
      await this.logAttempt(
        pass.id,
        guardUserId,
        dto,
        VisitorVerificationAction.DENIED,
      );
      return { verified: false, pass };
    }

    if (pass.status === VisitorPassStatus.VERIFIED) {
      await this.logAttempt(
        pass.id,
        guardUserId,
        dto,
        VisitorVerificationAction.VERIFIED,
      );
      return { verified: true, pass };
    }

    const isValid = await bcrypt.compare(dto.code, pass.verificationCodeHash);
    if (!isValid) {
      await this.logAttempt(
        pass.id,
        guardUserId,
        dto,
        VisitorVerificationAction.DENIED,
      );
      return { verified: false, pass };
    }

    pass.status = VisitorPassStatus.VERIFIED;
    pass.usedAt = new Date();
    pass.verifiedById = guardUserId;

    const saved = await this.visitorPassRepository.save(pass);
    await this.logAttempt(
      pass.id,
      guardUserId,
      dto,
      VisitorVerificationAction.VERIFIED,
    );

    return { verified: true, pass: saved };
  }

  private async logAttempt(
    passId: string,
    guardUserId: string,
    dto: VerifyVisitorPassDto,
    action: VisitorVerificationAction,
  ): Promise<void> {
    const log = this.visitorLogRepository.create({
      visitorPassId: passId,
      guardUserId,
      action,
      channel: dto.channel ?? VisitorVerificationChannel.MANUAL,
      notes: dto.notes,
    });

    await this.visitorLogRepository.save(log);
  }
}
