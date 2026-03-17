/**
 * Tenants Service
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan } from "typeorm";
import { Tenant, TenantStatus, Property, UserRole } from "../../entities";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import { UpdateTenantDto } from "./dto/update-tenant.dto";

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
  ) {}

  /**
   * Create a new tenant
   */
  async create(
    dto: CreateTenantDto,
    userId: string,
    userRole: UserRole,
  ): Promise<Tenant> {
    // Verify property access
    const property = await this.propertyRepository.findOne({
      where: { id: dto.propertyId },
      relations: ["assignedStaff"],
    });

    if (!property) {
      throw new NotFoundException("Property not found");
    }

    if (
      userRole === UserRole.GENERAL_MANAGER &&
      property.managerId !== userId
    ) {
      throw new ForbiddenException("Access denied to this property");
    }

    const contractStartDate = new Date(dto.contractStartDate);
    const contractEndDate = dto.contractEndDate
      ? new Date(dto.contractEndDate)
      : undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (contractEndDate && contractEndDate < contractStartDate) {
      throw new BadRequestException(
        "Contract end date cannot be earlier than contract start date",
      );
    }

    if (contractEndDate && contractEndDate < today) {
      throw new BadRequestException("Contract end date cannot be in the past");
    }

    const tenant = this.tenantRepository.create({
      ...dto,
      status: TenantStatus.ACTIVE,
      assignedStaffId: dto.assignedStaffId,
    });

    return this.tenantRepository.save(tenant);
  }

  /**
   * Get all tenants for properties accessible by user
   */
  async findAll(
    userId: string,
    userRole: UserRole,
    _managerId?: string,
  ): Promise<Tenant[]> {
    if (userRole === UserRole.OWNER) {
      // Owner sees ALL tenants across all properties
      return this.tenantRepository.find({
        relations: ["property"],
        order: { createdAt: "DESC" },
      });
    }

    if (userRole === UserRole.GENERAL_MANAGER) {
      // Manager sees all tenants in THEIR properties
      return this.tenantRepository
        .createQueryBuilder("tenant")
        .innerJoin(
          "tenant.property",
          "property",
          "property.managerId = :managerId",
          {
            managerId: userId,
          },
        )
        .leftJoinAndSelect("tenant.property", "prop")
        .orderBy("tenant.createdAt", "DESC")
        .getMany();
    }

    throw new ForbiddenException("Only owner and general manager can view tenants");
  }

  /**
   * Get tenants by property
   */
  async findByProperty(
    propertyId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Tenant[]> {
    if (userRole === UserRole.GENERAL_MANAGER) {
      const property = await this.propertyRepository.findOne({
        where: { id: propertyId, managerId: userId },
      });

      if (!property) {
        throw new ForbiddenException("Access denied to this property");
      }
    }

    return this.tenantRepository.find({
      where: { propertyId },
      relations: ["property", "assignedStaff"],
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Get tenant by ID
   */
  async findById(
    id: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({
      where: { id },
      relations: ["property", "assignedStaff", "payments"],
    });

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    if (userRole === UserRole.GENERAL_MANAGER) {
      if (!tenant.property || tenant.property.managerId !== userId) {
        throw new ForbiddenException("Access denied");
      }
    }

    if (userRole !== UserRole.OWNER && userRole !== UserRole.GENERAL_MANAGER) {
      throw new ForbiddenException("Only owner and general manager can access tenants");
    }

    return tenant;
  }

  /**
   * Update tenant
   */
  async update(
    id: string,
    dto: UpdateTenantDto,
    userId: string,
    userRole: UserRole,
  ): Promise<Tenant> {
    const tenant = await this.findById(id, userId, userRole);

    const nextStartDate = new Date(
      dto.contractStartDate ?? tenant.contractStartDate,
    );
    const nextEndDate = dto.contractEndDate
      ? new Date(dto.contractEndDate)
      : tenant.contractEndDate
        ? new Date(tenant.contractEndDate)
        : undefined;

    if (nextEndDate && nextEndDate < nextStartDate) {
      throw new BadRequestException(
        "Contract end date cannot be earlier than contract start date",
      );
    }

    if (dto.contractEndDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (nextEndDate && nextEndDate < today) {
        throw new BadRequestException("Contract end date cannot be in the past");
      }
    }

    Object.assign(tenant, dto);
    return this.tenantRepository.save(tenant);
  }

  /**
   * Delete tenant (soft delete by changing status)
   */
  async delete(id: string, userId: string, userRole: UserRole): Promise<void> {
    const tenant = await this.findById(id, userId, userRole);
    tenant.status = TenantStatus.INACTIVE;
    await this.tenantRepository.save(tenant);
  }

  /**
   * Get tenants with rent due today
   */
  async findWithRentDueToday(
    userId: string,
    userRole: UserRole,
  ): Promise<Tenant[]> {
    const today = new Date();
    const dayOfMonth = today.getDate();

    const qb = this.tenantRepository
      .createQueryBuilder("tenant")
      .leftJoinAndSelect("tenant.property", "property")
      .where("tenant.rentDueDay = :dayOfMonth", { dayOfMonth })
      .andWhere("tenant.status = :status", { status: TenantStatus.ACTIVE });

    if (userRole === UserRole.GENERAL_MANAGER) {
      qb.andWhere("property.managerId = :userId", { userId });
    }

    if (userRole !== UserRole.OWNER && userRole !== UserRole.GENERAL_MANAGER) {
      throw new ForbiddenException("Only owner and general manager can access tenants");
    }

    return qb.getMany();
  }

  /**
   * Get tenants with expired contracts
   */
  async findWithExpiredContracts(
    userId: string,
    userRole: UserRole,
  ): Promise<Tenant[]> {
    const qb = this.tenantRepository
      .createQueryBuilder("tenant")
      .leftJoinAndSelect("tenant.property", "property")
      .where("tenant.contractEndDate < :today", { today: new Date() })
      .andWhere("tenant.status = :status", { status: TenantStatus.ACTIVE });

    if (userRole === UserRole.GENERAL_MANAGER) {
      qb.andWhere("property.managerId = :userId", { userId });
    }

    if (userRole !== UserRole.OWNER && userRole !== UserRole.GENERAL_MANAGER) {
      throw new ForbiddenException("Only owner and general manager can access tenants");
    }

    return qb.getMany();
  }

  /**
   * Get tenant statistics for admin
   */
  async getStats(managerId?: string): Promise<{
    total: number;
    active: number;
    inactive: number;
  }> {
    let tenants: Tenant[];

    if (managerId) {
      tenants = await this.tenantRepository
        .createQueryBuilder("tenant")
        .innerJoin(
          "tenant.property",
          "property",
          "property.managerId = :managerId",
          {
            managerId,
          },
        )
        .getMany();
    } else {
      // No managerId = return all (Owner view)
      tenants = await this.tenantRepository.find();
    }

    return {
      total: tenants.length,
      active: tenants.filter((t) => t.status === TenantStatus.ACTIVE).length,
      inactive: tenants.filter((t) => t.status !== TenantStatus.ACTIVE).length,
    };
  }
}
