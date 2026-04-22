/**
 * Sync Service
 * Handles bi-directional data synchronization with conflict resolution
 */

import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan } from "typeorm";
import {
  Property,
  Tenant,
  Payment,
  AuditLog,
  SyncStatus,
  UserRole,
} from "../../entities";

interface SyncRecord {
  id: string;
  tableName: string;
  operation: "create" | "update" | "delete";
  data: Record<string, any>;
  localTimestamp: string;
  version: number;
}

interface SyncRequest {
  lastSyncTimestamp: string;
  changes: SyncRecord[];
}

export interface SyncResponse {
  serverChanges: {
    properties: Property[];
    tenants: Tenant[];
    payments: Payment[];
  };
  conflictedRecords?: SyncRecord[];
  syncTimestamp: string;
}

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Download changes from server since last sync
   */
  async downloadChanges(
    lastSyncTimestamp: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Omit<SyncResponse, "conflictedRecords">> {
    const since = new Date(lastSyncTimestamp);
    const now = new Date();

    let properties: Property[];
    let tenants: Tenant[];
    let payments: Payment[];

    if (userRole === UserRole.OWNER) {
      // Owner gets all properties and related data
      properties = await this.propertyRepository.find({
        where: { updatedAt: MoreThan(since) },
      });

      tenants = await this.tenantRepository
        .createQueryBuilder("tenant")
        .where("tenant.updatedAt > :since", { since })
        .getMany();

      payments = await this.paymentRepository
        .createQueryBuilder("payment")
        .where("payment.updatedAt > :since", { since })
        .getMany();
    } else if (userRole === UserRole.GENERAL_MANAGER) {
      // General manager gets managed properties and related data
      properties = await this.propertyRepository.find({
        where: { managerId: userId, updatedAt: MoreThan(since) },
      });

      const propertyIds = properties.map((p) => p.id);

      if (propertyIds.length > 0) {
        tenants = await this.tenantRepository
          .createQueryBuilder("tenant")
          .where("tenant.propertyId IN (:...propertyIds)", { propertyIds })
          .andWhere("tenant.updatedAt > :since", { since })
          .getMany();

        payments = await this.paymentRepository
          .createQueryBuilder("payment")
          .where("payment.propertyId IN (:...propertyIds)", { propertyIds })
          .andWhere("payment.updatedAt > :since", { since })
          .getMany();
      } else {
        tenants = [];
        payments = [];
      }
    } else if (userRole === UserRole.STAFF || userRole === UserRole.GUARD) {
      // Staff/guard get assigned properties and related data
      properties = await this.propertyRepository
        .createQueryBuilder("property")
        .innerJoin(
          "property.assignedStaff",
          "staffUser",
          "staffUser.id = :userId",
          {
            userId,
          },
        )
        .where("property.updatedAt > :since", { since })
        .getMany();

      tenants = await this.tenantRepository.find({
        where: { assignedStaffId: userId, updatedAt: MoreThan(since) },
      });

      const tenantIds = tenants.map((t) => t.id);
      if (tenantIds.length > 0) {
        payments = await this.paymentRepository
          .createQueryBuilder("payment")
          .where("payment.tenantId IN (:...tenantIds)", { tenantIds })
          .andWhere("payment.updatedAt > :since", { since })
          .getMany();
      } else {
        payments = [];
      }
    } else {
      properties = [];
      tenants = [];
      payments = [];
    }

    return {
      serverChanges: { properties, tenants, payments },
      syncTimestamp: now.toISOString(),
    };
  }

  /**
   * Upload changes from client to server
   */
  async uploadChanges(
    request: SyncRequest,
    userId: string,
    userRole: UserRole,
  ): Promise<SyncResponse> {
    const conflictedRecords: SyncRecord[] = [];
    const now = new Date();

    for (const change of request.changes) {
      try {
        const hasConflict = await this.processChange(change, userId, userRole);
        if (hasConflict) {
          conflictedRecords.push(change);
        }
      } catch (error) {
        // Log error and add to conflicts
        conflictedRecords.push(change);
        await this.logAudit({
          userId,
          action: "sync_error",
          entityType: change.tableName,
          entityId: change.id,
          details: { error: (error as Error).message, change },
        });
      }
    }

    // Get server changes after processing uploads
    const downloadResult = await this.downloadChanges(
      request.lastSyncTimestamp,
      userId,
      userRole,
    );

    return {
      ...downloadResult,
      conflictedRecords,
      syncTimestamp: now.toISOString(),
    };
  }

  /**
   * Process individual change with conflict detection
   */
  private async processChange(
    change: SyncRecord,
    userId: string,
    userRole: UserRole,
  ): Promise<boolean> {
    const { tableName, operation, data, version } = change;
    let hasConflict = false;

    switch (tableName) {
      case "properties":
        hasConflict = await this.processPropertyChange(
          operation,
          data,
          version,
          userId,
          userRole,
        );
        break;
      case "tenants":
        hasConflict = await this.processTenantChange(
          operation,
          data,
          version,
          userId,
          userRole,
        );
        break;
      case "payments":
        hasConflict = await this.processPaymentChange(
          operation,
          data,
          version,
          userId,
        );
        break;
      default:
        throw new BadRequestException(`Unknown table: ${tableName}`);
    }

    return hasConflict;
  }

  /**
   * Process property changes
   */
  private async processPropertyChange(
    operation: string,
    data: Record<string, any>,
    version: number,
    userId: string,
    userRole: UserRole,
  ): Promise<boolean> {
    // Only general manager can modify properties
    if (userRole !== UserRole.GENERAL_MANAGER) {
      return true; // Conflict - unauthorized
    }

    if (operation === "create") {
      const property = this.propertyRepository.create({
        ...data,
        managerId: userId,
        syncStatus: SyncStatus.SYNCED,
        version: 1,
      });
      await this.propertyRepository.save(property);
      return false;
    }

    const existing = await this.propertyRepository.findOne({
      where: { id: data.id },
    });
    if (!existing) {
      return true; // Conflict - not found
    }

    // Check version for conflicts
    if (existing.version > version) {
      return true; // Server has newer version
    }

    if (operation === "update") {
      Object.assign(existing, data);
      existing.version = version + 1;
      existing.syncStatus = SyncStatus.SYNCED;
      await this.propertyRepository.save(existing);
    } else if (operation === "delete") {
      await this.propertyRepository.softRemove(existing);
    }

    return false;
  }

  /**
   * Process tenant changes
   */
  private async processTenantChange(
    operation: string,
    data: Record<string, any>,
    version: number,
    userId: string,
    userRole: UserRole,
  ): Promise<boolean> {
    if (operation === "create") {
      const tenant = this.tenantRepository.create({
        ...data,
        assignedStaffId:
          userRole === UserRole.STAFF || userRole === UserRole.GUARD
            ? userId
            : data.assignedStaffId,
        syncStatus: SyncStatus.SYNCED,
        version: 1,
      });
      await this.tenantRepository.save(tenant);
      return false;
    }

    const existing = await this.tenantRepository.findOne({
      where: { id: data.id },
    });
    if (!existing) {
      return true;
    }

    // Check version for conflicts
    if (existing.version > version) {
      // General Manager changes always win
      if (userRole === UserRole.GENERAL_MANAGER) {
        // Manager can overwrite
      } else {
        return true; // Staff cannot overwrite manager changes
      }
    }

    if (operation === "update") {
      Object.assign(existing, data);
      existing.version = version + 1;
      existing.syncStatus = SyncStatus.SYNCED;
      await this.tenantRepository.save(existing);
    } else if (operation === "delete") {
      await this.tenantRepository.softRemove(existing);
    }

    return false;
  }

  /**
   * Process payment changes
   */
  private async processPaymentChange(
    operation: string,
    data: Record<string, any>,
    version: number,
    userId: string,
  ): Promise<boolean> {
    if (operation === "create") {
      const payment = this.paymentRepository.create({
        ...data,
        recordedById: userId,
        syncStatus: SyncStatus.SYNCED,
        version: 1,
      });
      await this.paymentRepository.save(payment);
      return false;
    }

    const existing = await this.paymentRepository.findOne({
      where: { id: data.id },
    });
    if (!existing) {
      return true;
    }

    if (existing.version > version) {
      return true;
    }

    if (operation === "update") {
      Object.assign(existing, data);
      existing.version = version + 1;
      existing.syncStatus = SyncStatus.SYNCED;
      await this.paymentRepository.save(existing);
    } else if (operation === "delete") {
      await this.paymentRepository.softRemove(existing);
    }

    return false;
  }

  /**
   * Log audit entry
   */
  private async logAudit(data: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    details: Record<string, any>;
  }): Promise<void> {
    const log = this.auditLogRepository.create(data);
    await this.auditLogRepository.save(log);
  }

  /**
   * Get sync status
   */
  async getSyncStatus(userId: string): Promise<{
    pendingUploads: number;
    lastSyncTimestamp: string | null;
  }> {
    // Count records with pending sync status
    const pendingProperties = await this.propertyRepository.count({
      where: { managerId: userId, syncStatus: SyncStatus.PENDING },
    });

    const pendingTenants = await this.tenantRepository.count({
      where: { assignedStaffId: userId, syncStatus: SyncStatus.PENDING },
    });

    const pendingPayments = await this.paymentRepository.count({
      where: { recordedById: userId, syncStatus: SyncStatus.PENDING },
    });

    return {
      pendingUploads: pendingProperties + pendingTenants + pendingPayments,
      lastSyncTimestamp: null, // Would be stored per-user in real implementation
    };
  }
}
