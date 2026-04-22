/**
 * Properties Service
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  Property,
  PropertyStatus,
  Tenant,
  TenantStatus,
  User,
  UserRole,
} from "../../entities";
import { CreatePropertyDto } from "./dto/create-property.dto";
import { UpdatePropertyDto } from "./dto/update-property.dto";

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Create a new property
   */
  async create(dto: CreatePropertyDto, managerId: string): Promise<Property> {
    const property = this.propertyRepository.create({
      ...dto,
      managerId,
      status: dto.status ?? PropertyStatus.ACTIVE,
    });

    return this.propertyRepository.save(property);
  }

  /**
   * Get all properties for a manager
   */
  async findAllByManager(managerId: string): Promise<Property[]> {
    return this.propertyRepository.find({
      where: { managerId },
      relations: ["assignedStaff"],
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Get ALL properties (Owner view)
   */
  async findAll(): Promise<Property[]> {
    return this.propertyRepository.find({
      relations: ["assignedStaff"],
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Get properties assigned to a staff member
   */
  async findAllByStaff(staffId: string): Promise<Property[]> {
    return this.propertyRepository
      .createQueryBuilder("property")
      .innerJoin("property.assignedStaff", "staff", "staff.id = :staffId", {
        staffId,
      })
      .getMany();
  }

  /**
   * Get property by ID
   */
  async findById(
    id: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Property> {
    const property = await this.propertyRepository.findOne({
      where: { id },
      relations: ["assignedStaff", "tenants"],
    });

    if (!property) {
      throw new NotFoundException("Property not found");
    }

    // Check access
    if (
      userRole === UserRole.GENERAL_MANAGER &&
      property.managerId !== userId
    ) {
      throw new ForbiddenException("Access denied");
    }

    if (userRole === UserRole.STAFF || userRole === UserRole.GUARD) {
      const isAssigned = property.assignedStaff?.some((s) => s.id === userId);
      if (!isAssigned) {
        throw new ForbiddenException("Access denied");
      }
    }

    if (userRole === UserRole.OWNER) {
      // Owner can view all properties
    }

    return property;
  }

  /**
   * Update property
   */
  async update(
    id: string,
    dto: UpdatePropertyDto,
    managerId: string,
  ): Promise<Property> {
    const property = await this.propertyRepository.findOne({
      where: { id, managerId },
    });

    if (!property) {
      throw new NotFoundException("Property not found");
    }

    Object.assign(property, dto);
    return this.propertyRepository.save(property);
  }

  /**
   * Delete property (General Manager only)
   */
  async delete(id: string, managerId: string): Promise<void> {
    const property = await this.propertyRepository.findOne({
      where: { id, managerId },
    });

    if (!property) {
      throw new NotFoundException("Property not found");
    }

    const activeTenantCount = await this.tenantRepository.count({
      where: { propertyId: id, status: TenantStatus.ACTIVE },
    });

    if (activeTenantCount > 0) {
      throw new ConflictException(
        "Cannot delete property while active tenants exist",
      );
    }

    await this.propertyRepository.remove(property);
  }

  /**
   * Assign staff to property
   */
  async assignStaff(
    propertyId: string,
    staffId: string,
    managerId: string,
  ): Promise<Property> {
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId, managerId },
      relations: ["assignedStaff"],
    });

    if (!property) {
      throw new NotFoundException("Property not found");
    }

    const staffMember = await this.userRepository.findOne({
      where: {
        id: staffId,
        managerId,
        role: In([UserRole.STAFF, UserRole.GUARD]),
      },
    });

    if (!staffMember) {
      throw new NotFoundException("Staff member not found");
    }

    // Check if already assigned
    const alreadyAssigned = property.assignedStaff?.some(
      (s) => s.id === staffId,
    );
    if (!alreadyAssigned) {
      property.assignedStaff = [...(property.assignedStaff || []), staffMember];
      await this.propertyRepository.save(property);
    }

    return property;
  }

  /**
   * Remove staff from property
   */
  async removeStaff(
    propertyId: string,
    staffId: string,
    managerId: string,
  ): Promise<Property> {
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId, managerId },
      relations: ["assignedStaff"],
    });

    if (!property) {
      throw new NotFoundException("Property not found");
    }

    property.assignedStaff =
      property.assignedStaff?.filter((s) => s.id !== staffId) || [];
    return this.propertyRepository.save(property);
  }

  /**
   * Get property statistics (for a specific manager)
   */
  async getStats(managerId: string): Promise<{
    total: number;
    active: number;
    inactive: number;
    maintenance: number;
  }> {
    const properties = await this.propertyRepository.find({
      where: { managerId },
    });

    return {
      total: properties.length,
      active: properties.filter((p) => p.status === PropertyStatus.ACTIVE)
        .length,
      inactive: properties.filter((p) => p.status === PropertyStatus.INACTIVE)
        .length,
      maintenance: properties.filter(
        (p) => p.status === PropertyStatus.MAINTENANCE,
      ).length,
    };
  }

  /**
   * Get ALL property statistics (Owner view)
   */
  async getAllStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    maintenance: number;
  }> {
    const properties = await this.propertyRepository.find();

    return {
      total: properties.length,
      active: properties.filter((p) => p.status === PropertyStatus.ACTIVE)
        .length,
      inactive: properties.filter((p) => p.status === PropertyStatus.INACTIVE)
        .length,
      maintenance: properties.filter(
        (p) => p.status === PropertyStatus.MAINTENANCE,
      ).length,
    };
  }
}
