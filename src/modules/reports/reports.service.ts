/**
 * Reports Service
 * Aggregates data for owner reports dashboard
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Between } from "typeorm";
import {
  Property,
  Tenant,
  TenantStatus,
  Payment,
  PaymentStatus,
  Complaint,
  ComplaintStatus,
  User,
  UserRole,
} from "../../entities";

export interface ReportSummary {
  totalProperties: number;
  totalTenants: number;
  totalStaff: number;
  monthlyRevenue: number;
  yearlyRevenue: number;
  pendingPayments: number;
  overduePayments: number;
  collectionRate: number;
  complaintStats: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
  };
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Complaint)
    private readonly complaintRepository: Repository<Complaint>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Get aggregated report summary
   */
  async getSummary(
    userId: string,
    userRole: UserRole,
  ): Promise<ReportSummary> {
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();

    // Build property query based on role
    const propertyQb = this.propertyRepository.createQueryBuilder("property");
    if (userRole === UserRole.GENERAL_MANAGER) {
      propertyQb.where("property.managerId = :userId", { userId });
    }
    const totalProperties = await propertyQb.getCount();

    // Get managed property IDs for scoping
    const properties = await propertyQb.select("property.id").getMany();
    const propertyIds = properties.map((p) => p.id);

    // Tenant count
    let totalTenants = 0;
    if (propertyIds.length > 0) {
      const tenantQb = this.tenantRepository
        .createQueryBuilder("tenant")
        .where("tenant.propertyId IN (:...propertyIds)", { propertyIds })
        .andWhere("tenant.status = :status", { status: TenantStatus.ACTIVE });
      totalTenants = await tenantQb.getCount();
    }

    // Staff count
    let totalStaff = 0;
    if (userRole === UserRole.OWNER) {
      totalStaff = await this.userRepository.count({
        where: { role: UserRole.STAFF, isActive: true },
      });
    } else if (userRole === UserRole.GENERAL_MANAGER) {
      totalStaff = await this.userRepository.count({
        where: { role: UserRole.STAFF, managerId: userId, isActive: true },
      });
    }

    // Payment stats for current month
    let monthlyRevenue = 0;
    let pendingPayments = 0;
    let overduePayments = 0;
    let paidCount = 0;

    if (propertyIds.length > 0) {
      const paymentQb = this.paymentRepository
        .createQueryBuilder("payment")
        .where("payment.month = :month", { month: curMonth })
        .andWhere("payment.year = :year", { year: curYear })
        .andWhere("payment.propertyId IN (:...propertyIds)", { propertyIds });

      const monthPayments = await paymentQb.getMany();

      for (const p of monthPayments) {
        const amount = Number(p.amount) || 0;
        if (p.status === PaymentStatus.PAID) {
          monthlyRevenue += amount;
          paidCount++;
        } else if (p.status === PaymentStatus.PENDING) {
          pendingPayments++;
        } else if (p.status === PaymentStatus.OVERDUE) {
          overduePayments++;
        }
      }
    }

    // Yearly revenue
    let yearlyRevenue = 0;
    if (propertyIds.length > 0) {
      const yearlyQb = this.paymentRepository
        .createQueryBuilder("payment")
        .where("payment.year = :year", { year: curYear })
        .andWhere("payment.status = :status", { status: PaymentStatus.PAID })
        .andWhere("payment.propertyId IN (:...propertyIds)", { propertyIds });

      const yearlyPayments = await yearlyQb.getMany();
      yearlyRevenue = yearlyPayments.reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0,
      );
    }

    // Collection rate
    const totalMonthCount = paidCount + pendingPayments + overduePayments;
    const collectionRate =
      totalMonthCount > 0
        ? Math.round((paidCount / totalMonthCount) * 100)
        : 0;

    // Complaint stats
    const complaintQb = this.complaintRepository.createQueryBuilder("complaint");
    if (userRole === UserRole.GENERAL_MANAGER) {
      complaintQb.where("complaint.propertyId IN (:...propertyIds)", {
        propertyIds: propertyIds.length > 0 ? propertyIds : ["none"],
      });
    }

    const complaints = await complaintQb.getMany();
    const complaintStats = {
      total: complaints.length,
      open: complaints.filter((c) => c.status === ComplaintStatus.OPEN)
        .length,
      inProgress: complaints.filter(
        (c) => c.status === ComplaintStatus.IN_PROGRESS,
      ).length,
      resolved: complaints.filter(
        (c) => c.status === ComplaintStatus.RESOLVED,
      ).length,
    };

    return {
      totalProperties,
      totalTenants,
      totalStaff,
      monthlyRevenue: Math.round(monthlyRevenue),
      yearlyRevenue: Math.round(yearlyRevenue),
      pendingPayments,
      overduePayments,
      collectionRate,
      complaintStats,
    };
  }
}
