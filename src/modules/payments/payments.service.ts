/**
 * Payments Service
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan, Between, In } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { Payment, PaymentStatus, Tenant } from "../../entities";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { UpdatePaymentDto } from "./dto/update-payment.dto";

export interface PaymentSummary {
  totalExpected: number;
  totalCollected: number;
  totalPending: number;
  totalOverdue: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  /**
   * Create a new payment
   */
  async create(dto: CreatePaymentDto, recordedById: string): Promise<Payment> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: dto.tenantId },
    });

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const paymentDate = new Date(dto.paymentDate);
    const remainingBalance = tenant.monthlyRent - dto.amount;

    const payment = this.paymentRepository.create({
      ...dto,
      recordedById,
      propertyId: tenant.propertyId,
      month: paymentDate.getMonth() + 1,
      year: paymentDate.getFullYear(),
      status:
        remainingBalance <= 0 ? PaymentStatus.PAID : PaymentStatus.PARTIAL,
      isPartialPayment: remainingBalance > 0,
      remainingBalance: Math.max(0, remainingBalance),
      receiptNumber: this.generateReceiptNumber(),
    });

    return this.paymentRepository.save(payment);
  }

  /**
   * Get all payments
   */
  async findAll(): Promise<Payment[]> {
    return this.paymentRepository.find({
      relations: ["tenant", "property", "recordedBy"],
      order: { paymentDate: "DESC" },
    });
  }

  /**
   * Get payments by month/year
   */
  async findByMonthYear(month: number, year: number): Promise<Payment[]> {
    return this.paymentRepository.find({
      where: { month, year },
      relations: ["tenant", "property", "recordedBy"],
      order: { paymentDate: "DESC" },
    });
  }

  /**
   * Get payments by tenant
   */
  async findByTenant(tenantId: string): Promise<Payment[]> {
    return this.paymentRepository.find({
      where: { tenantId },
      relations: ["property", "recordedBy"],
      order: { paymentDate: "DESC" },
    });
  }

  /**
   * Get payments by property
   */
  async findByProperty(propertyId: string): Promise<Payment[]> {
    return this.paymentRepository.find({
      where: { propertyId },
      relations: ["tenant", "recordedBy"],
      order: { paymentDate: "DESC" },
    });
  }

  /**
   * Get payment by ID
   */
  async findById(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      relations: ["tenant", "property", "recordedBy"],
    });

    if (!payment) {
      throw new NotFoundException("Payment not found");
    }

    return payment;
  }

  /**
   * Update payment
   */
  async update(id: string, dto: UpdatePaymentDto): Promise<Payment> {
    const payment = await this.findById(id);
    Object.assign(payment, dto);
    return this.paymentRepository.save(payment);
  }

  /**
   * Mark payment as paid
   */
  async markAsPaid(
    id: string,
    paymentMethod?: string,
    transactionReference?: string,
  ): Promise<Payment> {
    const payment = await this.findById(id);
    payment.status = PaymentStatus.PAID;
    payment.paymentDate = new Date();
    payment.paymentMethod = paymentMethod;
    payment.transactionReference = transactionReference;
    payment.remainingBalance = 0;
    payment.isPartialPayment = false;
    return this.paymentRepository.save(payment);
  }

  /**
   * Record partial payment
   */
  async recordPartialPayment(
    id: string,
    amount: number,
    paymentMethod?: string,
  ): Promise<Payment> {
    const payment = await this.findById(id);
    payment.amount += amount;
    payment.remainingBalance = Math.max(0, payment.remainingBalance - amount);
    payment.status =
      payment.remainingBalance <= 0
        ? PaymentStatus.PAID
        : PaymentStatus.PARTIAL;
    payment.isPartialPayment = payment.remainingBalance > 0;
    payment.paymentMethod = paymentMethod;
    payment.paymentDate = new Date();
    return this.paymentRepository.save(payment);
  }

  /**
   * Get overdue payments
   */
  async findOverdue(): Promise<Payment[]> {
    const today = new Date();
    return this.paymentRepository.find({
      where: {
        dueDate: LessThan(today),
        status: PaymentStatus.PENDING,
      },
      relations: ["tenant", "property"],
    });
  }

  /**
   * Get recent payments
   */
  async findRecent(limit: number = 10): Promise<Payment[]> {
    return this.paymentRepository.find({
      relations: ["tenant", "property"],
      order: { paymentDate: "DESC" },
      take: limit,
    });
  }

  /**
   * Get payment summary for a month
   */
  async getMonthSummary(
    month: number,
    year: number,
    propertyId?: string,
  ): Promise<PaymentSummary> {
    const whereClause: Record<string, unknown> = { month, year };
    if (propertyId) {
      whereClause["propertyId"] = propertyId;
    }

    const payments = await this.paymentRepository.find({ where: whereClause });

    // Get expected amount from active tenants
    const tenantsQuery = this.tenantRepository
      .createQueryBuilder("tenant")
      .where("tenant.status = :status", { status: "active" });

    if (propertyId) {
      tenantsQuery.andWhere("tenant.propertyId = :propertyId", { propertyId });
    }

    const tenants = await tenantsQuery.getMany();
    const totalExpected = tenants.reduce(
      (sum, t) => sum + Number(t.monthlyRent),
      0,
    );

    const paidPayments = payments.filter(
      (p) => p.status === PaymentStatus.PAID,
    );
    const pendingPayments = payments.filter(
      (p) =>
        p.status === PaymentStatus.PENDING ||
        p.status === PaymentStatus.PARTIAL,
    );
    const overduePayments = payments.filter(
      (p) => p.status === PaymentStatus.OVERDUE,
    );

    return {
      totalExpected,
      totalCollected: paidPayments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      ),
      totalPending: pendingPayments.reduce(
        (sum, p) => sum + Number(p.remainingBalance),
        0,
      ),
      totalOverdue: overduePayments.reduce(
        (sum, p) => sum + Number(p.remainingBalance),
        0,
      ),
      paidCount: paidPayments.length,
      pendingCount: pendingPayments.length,
      overdueCount: overduePayments.length,
    };
  }

  /**
   * Update overdue statuses
   */
  async updateOverdueStatuses(): Promise<number> {
    const today = new Date();
    const result = await this.paymentRepository
      .createQueryBuilder()
      .update(Payment)
      .set({ status: PaymentStatus.OVERDUE })
      .where("dueDate < :today", { today })
      .andWhere("status IN (:...statuses)", {
        statuses: [PaymentStatus.PENDING, PaymentStatus.PARTIAL],
      })
      .execute();

    return result.affected ?? 0;
  }

  /**
   * Batch mark multiple payments as paid
   */
  async batchMarkAsPaid(
    ids: string[],
    paymentMethod?: string,
  ): Promise<Payment[]> {
    const payments = await this.paymentRepository.find({
      where: { id: In(ids) },
    });

    if (payments.length === 0) {
      throw new NotFoundException("No payments found for the given IDs");
    }

    const now = new Date();
    for (const payment of payments) {
      payment.status = PaymentStatus.PAID;
      payment.paymentDate = now;
      payment.paymentMethod = paymentMethod;
      payment.remainingBalance = 0;
      payment.isPartialPayment = false;
    }

    return this.paymentRepository.save(payments);
  }

  /**
   * Generate receipt number
   */
  private generateReceiptNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `RCP-${timestamp}-${random}`;
  }
}
