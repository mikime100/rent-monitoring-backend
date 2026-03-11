/**
 * Tenants Service
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
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

    if (userRole === UserRole.STAFF) {
      const hasAccess = property.assignedStaff?.some((w) => w.id === userId);
      if (!hasAccess) {
        throw new ForbiddenException("Access denied to this property");
      }
    }

    const tenant = this.tenantRepository.create({
      ...dto,
      status: TenantStatus.ACTIVE,
      assignedStaffId:
        userRole === UserRole.STAFF ? userId : dto.assignedStaffId,
    });

    return this.tenantRepository.save(tenant);
  }

  /**
   * Get all tenants for properties accessible by user
   */
  async findAll(
    userId: string,
    userRole: UserRole,
    managerId?: string,
  ): Promise<Tenant[]> {
    if (userRole === UserRole.OWNER) {
      // Owner sees ALL tenants across all properties
      return this.tenantRepository.find({
        relations: ["property"],
        order: { createdAt: "DESC" },
      });
    } else if (userRole === UserRole.GENERAL_MANAGER) {
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
    } else {
      // Staff sees tenants in assigned properties or assigned to them
      return this.tenantRepository
        .createQueryBuilder("tenant")
        .innerJoin("tenant.property", "property")
        .innerJoin(
          "property.assignedStaff",
          "staffUser",
          "staffUser.id = :staffId",
          {
            staffId: userId,
          },
        )
        .leftJoinAndSelect("tenant.property", "prop")
        .orderBy("tenant.createdAt", "DESC")
        .getMany();
    }
  }

  /**
   * Get tenants by property
   */
  async findByProperty(propertyId: string): Promise<Tenant[]> {
    return this.tenantRepository.find({
      where: { propertyId },
      relations: ["property", "assignedStaff"],
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Get tenant by ID
   */
  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({
      where: { id },
      relations: ["property", "assignedStaff", "payments"],
    });

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    return tenant;
  }

  /**
   * Update tenant
   */
  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findById(id);
    Object.assign(tenant, dto);
    return this.tenantRepository.save(tenant);
  }

  /**
   * Delete tenant (soft delete by changing status)
   */
  async delete(id: string): Promise<void> {
    const tenant = await this.findById(id);
    tenant.status = TenantStatus.INACTIVE;
    await this.tenantRepository.save(tenant);
  }

  /**
   * Get tenants with rent due today
   */
  async findWithRentDueToday(): Promise<Tenant[]> {
    const today = new Date();
    const dayOfMonth = today.getDate();

    return this.tenantRepository.find({
      where: {
        rentDueDay: dayOfMonth,
        status: TenantStatus.ACTIVE,
      },
      relations: ["property"],
    });
  }

  /**
   * Get tenants with expired contracts
   */
  async findWithExpiredContracts(): Promise<Tenant[]> {
    return this.tenantRepository.find({
      where: {
        contractEndDate: LessThan(new Date()),
        status: TenantStatus.ACTIVE,
      },
      relations: ["property"],
    });
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
