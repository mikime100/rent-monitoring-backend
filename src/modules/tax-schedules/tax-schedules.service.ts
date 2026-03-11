/**
 * Tax Schedules Service
 * Handles CRUD and notification scheduling for tax payment reminders
 */

import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  TaxSchedule,
  TaxFrequency,
  Property,
  NotificationType,
} from "../../entities";
import { NotificationsService } from "../notifications/notifications.service";
import {
  CreateTaxScheduleDto,
  UpdateTaxScheduleDto,
} from "./dto/create-tax-schedule.dto";

@Injectable()
export class TaxSchedulesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaxSchedulesService.name);
  private cronInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(TaxSchedule)
    private readonly taxScheduleRepo: Repository<TaxSchedule>,
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Start a daily cron job to check tax due notifications
   * Runs every 6 hours to catch reminders at 5, 3, and 1 days before due
   */
  onModuleInit() {
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    this.cronInterval = setInterval(async () => {
      try {
        const result = await this.checkAndSendNotifications();
        if (result.sent > 0) {
          this.logger.log(
            `Tax notification check: ${result.checked} schedules, ${result.sent} notifications sent`,
          );
        }
      } catch (error) {
        this.logger.error("Tax notification cron failed", error);
      }
    }, SIX_HOURS);

    // Also run once on startup (after a short delay to let the DB connect)
    setTimeout(() => {
      this.checkAndSendNotifications().catch((err) =>
        this.logger.error("Initial tax notification check failed", err),
      );
    }, 10_000);
  }

  onModuleDestroy() {
    if (this.cronInterval) {
      clearInterval(this.cronInterval);
      this.cronInterval = null;
    }
  }

  /**
   * Calculate the next due date from today given frequency and day-of-month
   */
  private calculateNextDueDate(
    frequency: TaxFrequency,
    dueDay: number,
    fromDate?: Date,
  ): Date {
    const now = fromDate || new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // Clamp dueDay to valid range
    const clampedDay = Math.min(Math.max(dueDay, 1), 28);

    // Start with this month
    let next = new Date(year, month, clampedDay);

    // If this month's date has already passed, move to next period
    if (next <= now) {
      switch (frequency) {
        case TaxFrequency.MONTHLY:
          next = new Date(year, month + 1, clampedDay);
          break;
        case TaxFrequency.QUARTERLY:
          next = new Date(year, month + 3, clampedDay);
          break;
        case TaxFrequency.ANNUALLY:
          next = new Date(year + 1, month, clampedDay);
          break;
      }
    }

    return next;
  }

  /**
   * Advance nextDueDate to the following period after it has passed
   */
  private advanceDueDate(schedule: TaxSchedule): Date {
    const current = new Date(schedule.nextDueDate);
    switch (schedule.frequency) {
      case TaxFrequency.MONTHLY:
        return new Date(
          current.getFullYear(),
          current.getMonth() + 1,
          current.getDate(),
        );
      case TaxFrequency.QUARTERLY:
        return new Date(
          current.getFullYear(),
          current.getMonth() + 3,
          current.getDate(),
        );
      case TaxFrequency.ANNUALLY:
        return new Date(
          current.getFullYear() + 1,
          current.getMonth(),
          current.getDate(),
        );
    }
  }

  /**
   * Create a new tax schedule
   */
  async create(dto: CreateTaxScheduleDto): Promise<TaxSchedule> {
    const property = await this.propertyRepo.findOne({
      where: { id: dto.propertyId },
    });
    if (!property) {
      throw new NotFoundException("Property not found");
    }

    const nextDueDate = this.calculateNextDueDate(dto.frequency, dto.dueDay);

    const schedule = this.taxScheduleRepo.create({
      ...dto,
      nextDueDate,
      isActive: true,
    });

    return this.taxScheduleRepo.save(schedule);
  }

  /**
   * Get all tax schedules, optionally filtered by property
   */
  async findAll(propertyId?: string): Promise<TaxSchedule[]> {
    const where: any = {};
    if (propertyId) where.propertyId = propertyId;

    return this.taxScheduleRepo.find({
      where,
      relations: ["property"],
      order: { nextDueDate: "ASC" },
    });
  }

  /**
   * Get a single tax schedule by ID
   */
  async findById(id: string): Promise<TaxSchedule> {
    const schedule = await this.taxScheduleRepo.findOne({
      where: { id },
      relations: ["property"],
    });
    if (!schedule) {
      throw new NotFoundException("Tax schedule not found");
    }
    return schedule;
  }

  /**
   * Update a tax schedule
   */
  async update(id: string, dto: UpdateTaxScheduleDto): Promise<TaxSchedule> {
    const schedule = await this.findById(id);
    Object.assign(schedule, dto);

    // Recalculate next due date if frequency or dueDay changed
    if (dto.frequency || dto.dueDay) {
      schedule.nextDueDate = this.calculateNextDueDate(
        schedule.frequency,
        schedule.dueDay,
      );
      schedule.lastNotifiedDays = undefined;
    }

    return this.taxScheduleRepo.save(schedule);
  }

  /**
   * Delete a tax schedule
   */
  async remove(id: string): Promise<void> {
    const schedule = await this.findById(id);
    await this.taxScheduleRepo.remove(schedule);
  }

  /**
   * Check all active schedules and send notifications at 5, 3, 1 days before due
   */
  async checkAndSendNotifications(): Promise<{
    checked: number;
    sent: number;
  }> {
    const schedules = await this.taxScheduleRepo.find({
      where: { isActive: true },
      relations: ["property"],
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let sentCount = 0;

    for (const schedule of schedules) {
      const dueDate = new Date(schedule.nextDueDate);
      dueDate.setHours(0, 0, 0, 0);

      const diffMs = dueDate.getTime() - today.getTime();
      const daysUntilDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // If due date has passed, advance to next period
      if (daysUntilDue < 0) {
        schedule.nextDueDate = this.advanceDueDate(schedule);
        schedule.lastNotifiedDays = undefined;
        await this.taxScheduleRepo.save(schedule);
        continue;
      }

      // Check if we should send a notification (5, 3, or 1 day before)
      const reminderDays = [5, 3, 1];
      if (
        reminderDays.includes(daysUntilDue) &&
        schedule.lastNotifiedDays !== daysUntilDue
      ) {
        const propertyName = schedule.property?.name || "Unknown Property";
        const managerId = schedule.property?.managerId;

        if (managerId) {
          const emoji = daysUntilDue === 1 ? "🔴" : "⚠️";
          const dueDateStr = dueDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });

          await this.notificationsService.sendNotification({
            userId: managerId,
            title: `${emoji} Tax Due in ${daysUntilDue} day(s)`,
            body: `${schedule.taxLabel} for ${propertyName} is due on ${dueDateStr}`,
            type: NotificationType.TAX_DUE,
            relatedEntityId: schedule.id,
            relatedEntityType: "tax_schedule",
            data: {
              propertyName,
              taxLabel: schedule.taxLabel,
              dueDate: dueDate.toISOString(),
              daysUntilDue: daysUntilDue.toString(),
            },
          });

          schedule.lastNotifiedDays = daysUntilDue;
          await this.taxScheduleRepo.save(schedule);
          sentCount++;
        }
      }
    }

    return { checked: schedules.length, sent: sentCount };
  }
}
