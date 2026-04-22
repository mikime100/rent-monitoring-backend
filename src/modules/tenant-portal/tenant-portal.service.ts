/**
 * Tenant Portal Service
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  TenantAccount,
  Tenant,
  Property,
  Payment,
  PaymentStatus,
} from "../../entities";

@Injectable()
export class TenantPortalService {
  constructor(
    @InjectRepository(TenantAccount)
    private readonly tenantAccountRepository: Repository<TenantAccount>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  private async getActiveAccount(userId: string): Promise<TenantAccount> {
    const account = await this.tenantAccountRepository.findOne({
      where: { userId, isActive: true },
      relations: ["tenant", "property"],
    });

    if (!account) {
      throw new NotFoundException("Tenant account not found");
    }

    return account;
  }

  private getDaysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
  }

  private getDueDate(year: number, month: number, dueDay: number): Date {
    const daysInMonth = this.getDaysInMonth(year, month);
    const safeDay = Math.max(1, Math.min(dueDay, daysInMonth));
    return new Date(year, month - 1, safeDay);
  }

  private toIsoDate(date: Date): string {
    return date.toISOString().split("T")[0] ?? date.toISOString();
  }

  async getProfile(userId: string) {
    const account = await this.getActiveAccount(userId);

    const tenant =
      account.tenant ??
      (await this.tenantRepository.findOne({
        where: { id: account.tenantId },
      }));

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const property =
      account.property ??
      (await this.propertyRepository.findOne({
        where: { id: account.propertyId },
      }));

    if (!property) {
      throw new NotFoundException("Property not found");
    }

    return { tenant, property, account };
  }

  async getRentSummary(userId: string) {
    const account = await this.getActiveAccount(userId);
    const tenant = account.tenant;

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const now = new Date();
    const targetMonth = now.getMonth() + 1;
    const targetYear = now.getFullYear();
    const dueDate = this.getDueDate(targetYear, targetMonth, tenant.rentDueDay);

    const payment = await this.paymentRepository
      .createQueryBuilder("payment")
      .where("payment.tenantId = :tenantId", { tenantId: tenant.id })
      .andWhere("payment.month = :month", { month: targetMonth })
      .andWhere("payment.year = :year", { year: targetYear })
      .orderBy("payment.paymentDate", "DESC")
      .getOne();

    const latestPayment = await this.paymentRepository
      .createQueryBuilder("payment")
      .where("payment.tenantId = :tenantId", { tenantId: tenant.id })
      .orderBy("payment.paymentDate", "DESC")
      .getOne();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isPastDue = dueDate < today;

    let status: PaymentStatus = PaymentStatus.PENDING;
    let amountDue = Number(tenant.monthlyRent) || 0;
    let remainingBalance: number | undefined;

    if (payment) {
      remainingBalance = Number(payment.remainingBalance ?? 0);
      status = payment.status;
      amountDue = remainingBalance || Number(payment.amount) || amountDue;

      if (
        (payment.status === PaymentStatus.PENDING ||
          payment.status === PaymentStatus.PARTIAL) &&
        isPastDue
      ) {
        status = PaymentStatus.OVERDUE;
      }

      if (payment.status === PaymentStatus.PAID) {
        amountDue = 0;
      }
    } else if (isPastDue) {
      status = PaymentStatus.OVERDUE;
    }

    return {
      tenantId: tenant.id,
      propertyId: tenant.propertyId,
      unitNumber: tenant.unitNumber,
      currency: tenant.currency || "USD",
      monthlyRent: Number(tenant.monthlyRent) || 0,
      dueDay: tenant.rentDueDay,
      dueDate: this.toIsoDate(dueDate),
      status,
      amountDue,
      remainingBalance,
      paymentId: payment?.id,
      lastPaymentDate: latestPayment?.paymentDate?.toISOString(),
      propertyName: account.property?.name,
      penaltyNotice: "Penalties may apply according to lease terms.",
    };
  }

  async getPayments(userId: string, limit: number = 12): Promise<Payment[]> {
    const account = await this.getActiveAccount(userId);

    if (!account.tenantId) {
      throw new ForbiddenException("Tenant account is not linked to a tenant");
    }

    return this.paymentRepository.find({
      where: { tenantId: account.tenantId },
      order: { paymentDate: "DESC" },
      take: limit,
    });
  }
}
