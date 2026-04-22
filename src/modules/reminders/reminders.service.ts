/**
 * Rent Reminders Service
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import {
  TenantAccount,
  TenantReminderPreference,
  ReminderDispatchLog,
  ReminderChannel,
  Payment,
  PaymentStatus,
  NotificationType,
  UserRole,
} from "../../entities";
import { NotificationsService } from "../notifications/notifications.service";
import { UpdateTenantReminderPreferencesDto } from "./dto/update-tenant-reminder-preferences.dto";

type ReminderSettings = {
  pushEnabled: boolean;
  emailEnabled: boolean;
  dueDayEnabled: boolean;
  beforeDueDays: number[];
  afterDueDays: number[];
};

type ReminderProcessResult = {
  processedTenants: number;
  dispatched: number;
  skipped: number;
};

@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersService.name);
  private readonly DEFAULT_BEFORE_DUE_DAYS = [7, 3, 1];
  private readonly DEFAULT_AFTER_DUE_DAYS = [3, 7];
  private readonly runEveryMs = 60 * 60 * 1000;
  private isProcessing = false;
  private runTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(TenantAccount)
    private readonly tenantAccountRepository: Repository<TenantAccount>,
    @InjectRepository(TenantReminderPreference)
    private readonly preferenceRepository: Repository<TenantReminderPreference>,
    @InjectRepository(ReminderDispatchLog)
    private readonly dispatchLogRepository: Repository<ReminderDispatchLog>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const autoProcess =
      this.configService.get<string>("REMINDERS_AUTO_PROCESS") !== "false";

    if (!autoProcess) {
      this.logger.log("Auto reminder processing disabled");
      return;
    }

    this.runTimer = setInterval(() => {
      void this.processDueReminders();
    }, this.runEveryMs);

    void this.processDueReminders();
    this.logger.log("Auto reminder processing initialized");
  }

  onModuleDestroy(): void {
    if (this.runTimer) {
      clearInterval(this.runTimer);
      this.runTimer = undefined;
    }
  }

  private normalizeDays(values: number[], defaults: number[]): number[] {
    const safe = (values || [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 30);

    const unique = Array.from(new Set(safe)).sort((a, b) => b - a);
    return unique.length > 0 ? unique : [...defaults];
  }

  private getDaysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
  }

  private getDueDate(year: number, month: number, dueDay: number): Date {
    const daysInMonth = this.getDaysInMonth(year, month);
    const safeDay = Math.max(1, Math.min(dueDay, daysInMonth));
    return new Date(Date.UTC(year, month - 1, safeDay, 0, 0, 0, 0));
  }

  private getTodayUtc(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  private getReminderType(
    daysUntilDue: number,
    settings: ReminderSettings,
  ): string | null {
    if (daysUntilDue > 0 && settings.beforeDueDays.includes(daysUntilDue)) {
      return `before_due_${daysUntilDue}`;
    }

    if (daysUntilDue === 0 && settings.dueDayEnabled) {
      return "due_day";
    }

    const overdueDays = Math.abs(daysUntilDue);
    if (daysUntilDue < 0 && settings.afterDueDays.includes(overdueDays)) {
      return `overdue_${overdueDays}`;
    }

    return null;
  }

  private buildDefaultSettings(): ReminderSettings {
    return {
      pushEnabled: true,
      emailEnabled: true,
      dueDayEnabled: true,
      beforeDueDays: [...this.DEFAULT_BEFORE_DUE_DAYS],
      afterDueDays: [...this.DEFAULT_AFTER_DUE_DAYS],
    };
  }

  private mapPreferenceToSettings(
    pref?: TenantReminderPreference,
  ): ReminderSettings {
    if (!pref) {
      return this.buildDefaultSettings();
    }

    return {
      pushEnabled: pref.pushEnabled,
      emailEnabled: pref.emailEnabled,
      dueDayEnabled: pref.dueDayEnabled,
      beforeDueDays: this.normalizeDays(
        pref.beforeDueDays,
        this.DEFAULT_BEFORE_DUE_DAYS,
      ),
      afterDueDays: this.normalizeDays(
        pref.afterDueDays,
        this.DEFAULT_AFTER_DUE_DAYS,
      ),
    };
  }

  private async getActiveAccount(userId: string): Promise<TenantAccount> {
    const account = await this.tenantAccountRepository.findOne({
      where: { userId, isActive: true },
      relations: ["tenant", "user"],
    });

    if (!account) {
      throw new NotFoundException("Tenant account not found");
    }

    return account;
  }

  async getTenantPreferences(userId: string): Promise<ReminderSettings> {
    const account = await this.getActiveAccount(userId);
    const pref = await this.preferenceRepository.findOne({
      where: { tenantAccountId: account.id },
    });

    return this.mapPreferenceToSettings(pref || undefined);
  }

  async updateTenantPreferences(
    userId: string,
    dto: UpdateTenantReminderPreferencesDto,
  ): Promise<ReminderSettings> {
    const account = await this.getActiveAccount(userId);

    let pref = await this.preferenceRepository.findOne({
      where: { tenantAccountId: account.id },
    });

    if (!pref) {
      pref = this.preferenceRepository.create({
        tenantAccountId: account.id,
        pushEnabled: true,
        emailEnabled: true,
        dueDayEnabled: true,
        beforeDueDays: [...this.DEFAULT_BEFORE_DUE_DAYS],
        afterDueDays: [...this.DEFAULT_AFTER_DUE_DAYS],
      });
    }

    if (dto.pushEnabled !== undefined) {
      pref.pushEnabled = dto.pushEnabled;
    }

    if (dto.emailEnabled !== undefined) {
      pref.emailEnabled = dto.emailEnabled;
    }

    if (dto.dueDayEnabled !== undefined) {
      pref.dueDayEnabled = dto.dueDayEnabled;
    }

    if (dto.beforeDueDays !== undefined) {
      pref.beforeDueDays = this.normalizeDays(
        dto.beforeDueDays,
        this.DEFAULT_BEFORE_DUE_DAYS,
      );
    }

    if (dto.afterDueDays !== undefined) {
      pref.afterDueDays = this.normalizeDays(
        dto.afterDueDays,
        this.DEFAULT_AFTER_DUE_DAYS,
      );
    }

    const saved = await this.preferenceRepository.save(pref);
    return this.mapPreferenceToSettings(saved);
  }

  private formatAmount(amount: number, currency: string): string {
    return `${currency} ${Number(amount || 0).toFixed(2)}`;
  }

  private buildReminderMessage(params: {
    daysUntilDue: number;
    amountDue: number;
    currency: string;
    dueDateIso: string;
  }): { title: string; body: string; isOverdue: boolean } {
    const { daysUntilDue, amountDue, currency, dueDateIso } = params;
    const formattedAmount = this.formatAmount(amountDue, currency);

    if (daysUntilDue < 0) {
      const overdueBy = Math.abs(daysUntilDue);
      return {
        title: "Rent Payment Overdue",
        body: `Your rent payment of ${formattedAmount} is overdue by ${overdueBy} day(s). Due date was ${dueDateIso}. Penalties may apply according to lease terms.`,
        isOverdue: true,
      };
    }

    if (daysUntilDue === 0) {
      return {
        title: "Rent Due Today",
        body: `Your rent payment of ${formattedAmount} is due today (${dueDateIso}). Penalties may apply according to lease terms.`,
        isOverdue: false,
      };
    }

    return {
      title: "Upcoming Rent Reminder",
      body: `Your rent payment of ${formattedAmount} is due in ${daysUntilDue} day(s) on ${dueDateIso}. Penalties may apply according to lease terms.`,
      isOverdue: false,
    };
  }

  private async sendEmailReminder(
    email: string,
    firstName: string,
    title: string,
    body: string,
  ): Promise<void> {
    const smtpHost = this.configService.get<string>("SMTP_HOST");
    const smtpPort = this.configService.get<number>("SMTP_PORT");
    const smtpUser = this.configService.get<string>("SMTP_USER");
    const smtpPass = this.configService.get<string>("SMTP_PASS");
    const smtpFrom =
      this.configService.get<string>("SMTP_FROM") ||
      "noreply@rentmanagement.com";

    if (!smtpHost || !smtpUser || !smtpPass) {
      this.logger.log(`EMAIL REMINDER for ${email}: ${title} - ${body}`);
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
        subject: title,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1a73e8; margin-bottom: 16px;">${title}</h2>
            <p>Hello ${firstName},</p>
            <p>${body}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 12px;">Rent Management System</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error("Failed to send reminder email", error as any);
    }
  }

  private async dispatchReminder(params: {
    tenantAccount: TenantAccount;
    payment?: Payment;
    dueDateIso: string;
    reminderType: string;
    title: string;
    body: string;
    isOverdue: boolean;
    settings: ReminderSettings;
  }): Promise<number> {
    const {
      tenantAccount,
      payment,
      dueDateIso,
      reminderType,
      title,
      body,
      isOverdue,
      settings,
    } = params;

    let sentCount = 0;

    const channels: ReminderChannel[] = [];
    if (settings.pushEnabled) {
      channels.push(ReminderChannel.PUSH);
    }
    if (settings.emailEnabled && tenantAccount.user?.email) {
      channels.push(ReminderChannel.EMAIL);
    }

    for (const channel of channels) {
      const dedupeKey = `${tenantAccount.id}:${dueDateIso}:${reminderType}:${channel}`;

      const exists = await this.dispatchLogRepository.findOne({
        where: { dedupeKey },
        select: ["id"],
      });

      if (exists) {
        continue;
      }

      if (channel === ReminderChannel.PUSH) {
        await this.notificationsService.sendNotification({
          userId: tenantAccount.userId,
          title,
          body,
          type: isOverdue
            ? NotificationType.PAYMENT_OVERDUE
            : NotificationType.PAYMENT_REMINDER,
          relatedEntityId: payment?.id,
          relatedEntityType: payment ? "payment" : undefined,
          data: {
            reminderType,
            dueDate: dueDateIso,
            tenantId: tenantAccount.tenantId,
            propertyId: tenantAccount.propertyId,
          },
        });
      } else {
        await this.sendEmailReminder(
          tenantAccount.user?.email || "",
          tenantAccount.tenant?.firstName || "Tenant",
          title,
          body,
        );
      }

      const log = this.dispatchLogRepository.create({
        tenantAccountId: tenantAccount.id,
        paymentId: payment?.id,
        channel,
        reminderType,
        dueDate: new Date(dueDateIso),
        dedupeKey,
        dispatchedAt: new Date(),
      });

      await this.dispatchLogRepository.save(log);
      sentCount += 1;
    }

    return sentCount;
  }

  async processDueReminders(): Promise<ReminderProcessResult> {
    if (this.isProcessing) {
      return { processedTenants: 0, dispatched: 0, skipped: 0 };
    }

    this.isProcessing = true;

    try {
      const accounts = await this.tenantAccountRepository.find({
        where: { isActive: true },
        relations: ["tenant", "user"],
      });

      if (accounts.length === 0) {
        return { processedTenants: 0, dispatched: 0, skipped: 0 };
      }

      const accountIds = accounts.map((account) => account.id);
      const tenantIds = accounts.map((account) => account.tenantId);

      const now = new Date();
      const month = now.getUTCMonth() + 1;
      const year = now.getUTCFullYear();

      const [prefs, payments] = await Promise.all([
        this.preferenceRepository.find({
          where: { tenantAccountId: In(accountIds) },
        }),
        this.paymentRepository.find({
          where: { tenantId: In(tenantIds), month, year },
          order: { updatedAt: "DESC" },
        }),
      ]);

      const prefMap = new Map<string, TenantReminderPreference>(
        prefs.map((pref) => [pref.tenantAccountId, pref]),
      );

      const paymentMap = new Map<string, Payment>();
      for (const payment of payments) {
        if (!paymentMap.has(payment.tenantId)) {
          paymentMap.set(payment.tenantId, payment);
        }
      }

      let dispatched = 0;
      let skipped = 0;

      const todayUtc = this.getTodayUtc();
      const dayMs = 24 * 60 * 60 * 1000;

      for (const account of accounts) {
        if (!account.user || !account.tenant) {
          skipped += 1;
          continue;
        }

        if (account.user.role !== UserRole.TENANT || !account.user.isActive) {
          skipped += 1;
          continue;
        }

        const settings = this.mapPreferenceToSettings(prefMap.get(account.id));
        if (!settings.pushEnabled && !settings.emailEnabled) {
          skipped += 1;
          continue;
        }

        const dueDate = this.getDueDate(year, month, account.tenant.rentDueDay);
        const dueDateIso = dueDate.toISOString().slice(0, 10);
        const daysUntilDue = Math.round(
          (dueDate.getTime() - todayUtc.getTime()) / dayMs,
        );

        const reminderType = this.getReminderType(daysUntilDue, settings);
        if (!reminderType) {
          skipped += 1;
          continue;
        }

        const payment = paymentMap.get(account.tenantId);

        if (payment?.status === PaymentStatus.PAID) {
          skipped += 1;
          continue;
        }

        const amountDue = payment
          ? Number(payment.remainingBalance || payment.amount || 0)
          : Number(account.tenant.monthlyRent || 0);

        const message = this.buildReminderMessage({
          daysUntilDue,
          amountDue,
          currency: account.tenant.currency || "USD",
          dueDateIso,
        });

        const sent = await this.dispatchReminder({
          tenantAccount: account,
          payment,
          dueDateIso,
          reminderType,
          title: message.title,
          body: message.body,
          isOverdue: message.isOverdue,
          settings,
        });

        if (sent === 0) {
          skipped += 1;
        } else {
          dispatched += sent;
        }
      }

      return {
        processedTenants: accounts.length,
        dispatched,
        skipped,
      };
    } finally {
      this.isProcessing = false;
    }
  }
}
