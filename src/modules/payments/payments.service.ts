/**
 * Payments Service
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan, Between, In } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { Payment, PaymentStatus, Tenant, UserRole } from "../../entities";
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
  private readonly MAX_PAYMENT_AMOUNT = 99_999_999.99;
  private readonly REPLAY_WINDOW_MS = 1000;
  private readonly inFlightReplayKeys = new Set<string>();

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  private applyRoleScope(
    qb: ReturnType<Repository<Payment>["createQueryBuilder"]>,
    userId: string,
    userRole: UserRole,
  ) {
    if (userRole === UserRole.OWNER) {
      return qb;
    }

    if (userRole === UserRole.GENERAL_MANAGER) {
      return qb
        .innerJoin("payment.property", "scopeProperty")
        .andWhere("scopeProperty.managerId = :scopeManagerId", {
          scopeManagerId: userId,
        });
    }

    throw new ForbiddenException(
      "Only owner and general manager can access payments",
    );
  }

  /**
   * Create a new payment
   */
  async create(
    dto: CreatePaymentDto,
    recordedById: string,
    userRole: UserRole,
  ): Promise<Payment> {
    if (!Number.isFinite(Number(dto.amount)) || Number(dto.amount) <= 0) {
      throw new BadRequestException("Payment amount must be greater than zero");
    }

    if (Number(dto.amount) > this.MAX_PAYMENT_AMOUNT) {
      throw new BadRequestException("Payment amount exceeds allowed maximum");
    }

    const paymentDate = new Date(dto.paymentDate);
    if (Number.isNaN(paymentDate.getTime())) {
      throw new BadRequestException("Invalid payment date");
    }

    const tenant = await this.tenantRepository.findOne({
      where: { id: dto.tenantId },
      relations: ["property"],
    });

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    if (
      userRole === UserRole.GENERAL_MANAGER &&
      tenant.property?.managerId !== recordedById
    ) {
      throw new ForbiddenException("Access denied to tenant payment records");
    }

    if (userRole !== UserRole.OWNER && userRole !== UserRole.GENERAL_MANAGER) {
      throw new ForbiddenException(
        "Only owner and general manager can create payments",
      );
    }

    const replayKey =
      dto.transactionReference?.trim() ||
      `${dto.tenantId}:${Number(dto.amount)}:${paymentDate.toISOString()}`;

    if (this.inFlightReplayKeys.has(replayKey)) {
      throw new ConflictException("Duplicate payment submission detected");
    }

    this.inFlightReplayKeys.add(replayKey);

    try {
      if (dto.transactionReference) {
        const existingRef = await this.paymentRepository.findOne({
          where: { transactionReference: dto.transactionReference },
        });

        if (existingRef) {
          throw new ConflictException("Duplicate transaction reference");
        }
      }

      const duplicateWindowStart = new Date(
        paymentDate.getTime() - this.REPLAY_WINDOW_MS,
      );
      const duplicateWindowEnd = new Date(
        paymentDate.getTime() + this.REPLAY_WINDOW_MS,
      );

      const duplicatePayment = await this.paymentRepository.findOne({
        where: {
          tenantId: dto.tenantId,
          amount: dto.amount,
          paymentDate: Between(duplicateWindowStart, duplicateWindowEnd),
        },
      });

      if (duplicatePayment) {
        throw new ConflictException("Duplicate payment submission detected");
      }

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
    } finally {
      this.inFlightReplayKeys.delete(replayKey);
    }
  }

  /**
   * Get all payments
   */
  async findAll(userId: string, userRole: UserRole): Promise<Payment[]> {
    const qb = this.paymentRepository
      .createQueryBuilder("payment")
      .leftJoinAndSelect("payment.tenant", "tenant")
      .leftJoinAndSelect("payment.property", "property")
      .leftJoinAndSelect("payment.recordedBy", "recordedBy")
      .orderBy("payment.paymentDate", "DESC");

    return this.applyRoleScope(qb, userId, userRole).getMany();
  }

  /**
   * Get payments by month/year
   */
  async findByMonthYear(
    month: number,
    year: number,
    userId: string,
    userRole: UserRole,
  ): Promise<Payment[]> {
    const qb = this.paymentRepository
      .createQueryBuilder("payment")
      .leftJoinAndSelect("payment.tenant", "tenant")
      .leftJoinAndSelect("payment.property", "property")
      .leftJoinAndSelect("payment.recordedBy", "recordedBy")
      .where("payment.month = :month", { month })
      .andWhere("payment.year = :year", { year })
      .orderBy("payment.paymentDate", "DESC");

    return this.applyRoleScope(qb, userId, userRole).getMany();
  }

  /**
   * Get payments by tenant
   */
  async findByTenant(
    tenantId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Payment[]> {
    const qb = this.paymentRepository
      .createQueryBuilder("payment")
      .leftJoinAndSelect("payment.property", "property")
      .leftJoinAndSelect("payment.recordedBy", "recordedBy")
      .where("payment.tenantId = :tenantId", { tenantId })
      .orderBy("payment.paymentDate", "DESC");

    return this.applyRoleScope(qb, userId, userRole).getMany();
  }

  /**
   * Get payments by property
   */
  async findByProperty(
    propertyId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Payment[]> {
    if (userRole === UserRole.GENERAL_MANAGER) {
      const hasPropertyAccess = await this.tenantRepository
        .createQueryBuilder("tenant")
        .innerJoin("tenant.property", "property")
        .where("tenant.propertyId = :propertyId", { propertyId })
        .andWhere("property.managerId = :managerId", { managerId: userId })
        .getExists();

      if (!hasPropertyAccess) {
        throw new ForbiddenException("Access denied to property payments");
      }
    }

    if (userRole !== UserRole.OWNER && userRole !== UserRole.GENERAL_MANAGER) {
      throw new ForbiddenException(
        "Only owner and general manager can access payments",
      );
    }

    return this.paymentRepository.find({
      where: { propertyId },
      relations: ["tenant", "recordedBy"],
      order: { paymentDate: "DESC" },
    });
  }

  /**
   * Get payment by ID
   */
  async findById(id: string, userId: string, userRole: UserRole): Promise<Payment> {
    const qb = this.paymentRepository
      .createQueryBuilder("payment")
      .leftJoinAndSelect("payment.tenant", "tenant")
      .leftJoinAndSelect("payment.property", "property")
      .leftJoinAndSelect("payment.recordedBy", "recordedBy")
      .where("payment.id = :id", { id });

    const payment = await this.applyRoleScope(qb, userId, userRole).getOne();

    if (!payment) {
      throw new NotFoundException("Payment not found");
    }

    return payment;
  }

  /**
   * Update payment
   */
  async update(
    id: string,
    dto: UpdatePaymentDto,
    userId: string,
    userRole: UserRole,
  ): Promise<Payment> {
    const payment = await this.findById(id, userId, userRole);
    Object.assign(payment, dto);
    return this.paymentRepository.save(payment);
  }

  /**
   * Mark payment as paid
   */
  async markAsPaid(
    id: string,
    userId: string,
    userRole: UserRole,
    paymentMethod?: string,
    transactionReference?: string,
  ): Promise<Payment> {
    const payment = await this.findById(id, userId, userRole);
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
    userId: string,
    userRole: UserRole,
    amount: number,
    paymentMethod?: string,
  ): Promise<Payment> {
    const payment = await this.findById(id, userId, userRole);
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
  async findOverdue(userId: string, userRole: UserRole): Promise<Payment[]> {
    const today = new Date();

    const qb = this.paymentRepository
      .createQueryBuilder("payment")
      .leftJoinAndSelect("payment.tenant", "tenant")
      .leftJoinAndSelect("payment.property", "property")
      .where("payment.dueDate < :today", { today })
      .andWhere("payment.status = :status", { status: PaymentStatus.PENDING });

    return this.applyRoleScope(qb, userId, userRole).getMany();
  }

  /**
   * Get recent payments
   */
  async findRecent(
    limit: number = 10,
    userId: string,
    userRole: UserRole,
  ): Promise<Payment[]> {
    const qb = this.paymentRepository
      .createQueryBuilder("payment")
      .leftJoinAndSelect("payment.tenant", "tenant")
      .leftJoinAndSelect("payment.property", "property")
      .orderBy("payment.paymentDate", "DESC")
      .take(limit);

    return this.applyRoleScope(qb, userId, userRole).getMany();
  }

  /**
   * Get payment summary for a month
   */
  async getMonthSummary(
    month: number,
    year: number,
    userId: string,
    userRole: UserRole,
    propertyId?: string,
  ): Promise<PaymentSummary> {
    if (userRole !== UserRole.OWNER && userRole !== UserRole.GENERAL_MANAGER) {
      throw new ForbiddenException(
        "Only owner and general manager can access payments",
      );
    }

    const paymentsQb = this.paymentRepository
      .createQueryBuilder("payment")
      .where("payment.month = :month", { month })
      .andWhere("payment.year = :year", { year });

    if (propertyId) {
      paymentsQb.andWhere("payment.propertyId = :propertyId", { propertyId });
    }

    const payments = await this.applyRoleScope(
      paymentsQb,
      userId,
      userRole,
    ).getMany();

    // Get expected amount from active tenants
    const tenantsQuery = this.tenantRepository
      .createQueryBuilder("tenant")
      .where("tenant.status = :status", { status: "active" });

    if (propertyId) {
      tenantsQuery.andWhere("tenant.propertyId = :propertyId", { propertyId });
    }

    if (userRole === UserRole.GENERAL_MANAGER) {
      tenantsQuery
        .innerJoin("tenant.property", "property")
        .andWhere("property.managerId = :managerId", { managerId: userId });
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
  async updateOverdueStatuses(
    userId: string,
    userRole: UserRole,
  ): Promise<number> {
    if (userRole !== UserRole.OWNER && userRole !== UserRole.GENERAL_MANAGER) {
      throw new ForbiddenException(
        "Only owner and general manager can update overdue statuses",
      );
    }

    const today = new Date();
    const query = this.paymentRepository
      .createQueryBuilder()
      .update(Payment)
      .set({ status: PaymentStatus.OVERDUE })
      .where("dueDate < :today", { today })
      .andWhere("status IN (:...statuses)", {
        statuses: [PaymentStatus.PENDING, PaymentStatus.PARTIAL],
      });

    if (userRole === UserRole.GENERAL_MANAGER) {
      const managerPropertyRows = await this.paymentRepository
        .createQueryBuilder("payment")
        .select("DISTINCT payment.propertyId", "propertyId")
        .innerJoin("payment.property", "property")
        .where("property.managerId = :managerId", { managerId: userId })
        .getRawMany<{ propertyId: string }>();

      const managerPropertyIds = managerPropertyRows
        .map((row) => row.propertyId)
        .filter(Boolean);

      if (managerPropertyIds.length === 0) {
        return 0;
      }

      query.andWhere("property_id IN (:...managerPropertyIds)", {
        managerPropertyIds,
      });
    }

    const result = await query.execute();

    return result.affected ?? 0;
  }

  /**
   * Batch mark multiple payments as paid
   */
  async batchMarkAsPaid(
    ids: string[],
    userId: string,
    userRole: UserRole,
    paymentMethod?: string,
  ): Promise<Payment[]> {
    const qb = this.paymentRepository
      .createQueryBuilder("payment")
      .where("payment.id IN (:...ids)", { ids });

    const payments = await this.applyRoleScope(qb, userId, userRole).getMany();

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
