/**
 * Users Service
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { User, UserRole, Property } from "../../entities";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
  ) {}

  private async attachAssignedProperties(staffMembers: User[]): Promise<void> {
    if (staffMembers.length === 0) {
      return;
    }

    for (const member of staffMembers) {
      member.assignedProperties = await this.propertyRepository
        .createQueryBuilder("property")
        .innerJoin("property_staff", "ps", "ps.property_id = property.id")
        .where("ps.staff_id = :staffId", { staffId: member.id })
        .orderBy("property.createdAt", "DESC")
        .getMany();
    }
  }

  /**
   * Create a new staff member (General Manager only)
   */
  async createStaff(dto: CreateUserDto, managerId: string): Promise<User> {
    const existingUser = await this.userRepository.findOne({
      where: [{ email: dto.email }, { phone: dto.phone }],
    });

    if (existingUser) {
      throw new ConflictException(
        "User with this email or phone already exists",
      );
    }

    const requestedPropertyIds = [...new Set(dto.assignedPropertyIds ?? [])];
    let managedProperties: Property[] = [];

    if (requestedPropertyIds.length > 0) {
      managedProperties = await this.propertyRepository.find({
        where: {
          id: In(requestedPropertyIds),
          managerId,
        },
        relations: ["assignedStaff"],
      });

      if (managedProperties.length !== requestedPropertyIds.length) {
        throw new ForbiddenException(
          "Some selected properties are invalid or not managed by you",
        );
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const staffMember = this.userRepository.create({
      ...dto,
      password: hashedPassword,
      role: UserRole.STAFF,
      managerId,
      isActive: true,
    });

    const saved = await this.userRepository.save(staffMember);

    if (managedProperties.length > 0) {
      try {
        for (const property of managedProperties) {
          const alreadyAssigned = property.assignedStaff?.some(
            (assigned) => assigned.id === saved.id,
          );
          if (!alreadyAssigned) {
            property.assignedStaff = [...(property.assignedStaff || []), saved];
          }
        }

        await this.propertyRepository.save(managedProperties);
      } catch {
        // Keep staff creation successful even if assignment sync fails.
      }
    }

    const result = saved;
    await this.attachAssignedProperties([result]);
    delete (result as any).password;
    return result;
  }

  /**
   * Get all staff for manager
   */
  async findStaffByManager(managerId: string): Promise<User[]> {
    const staff = await this.userRepository.find({
      where: { managerId, role: UserRole.STAFF },
      order: { createdAt: "DESC" },
    });

    await this.attachAssignedProperties(staff);

    staff.forEach((member) => {
      delete (member as any).password;
    });

    return staff;
  }

  /**
   * Get ALL staff users (Owner view)
   */
  async findAllStaff(): Promise<User[]> {
    const staff = await this.userRepository.find({
      where: { role: UserRole.STAFF },
      order: { createdAt: "DESC" },
    });

    await this.attachAssignedProperties(staff);

    staff.forEach((member) => {
      delete (member as any).password;
    });

    return staff;
  }

  /**
   * Get user by ID
   */
  async findById(id: string, managerId?: string): Promise<User> {
    const whereClause: Record<string, any> = { id };
    if (managerId) {
      whereClause["managerId"] = managerId;
    }

    const user = await this.userRepository.findOne({
      where: whereClause,
      select: [
        "id",
        "email",
        "phone",
        "firstName",
        "lastName",
        "role",
        "isActive",
        "createdAt",
      ],
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.attachAssignedProperties([user]);

    return user;
  }

  /**
   * Update staff member
   */
  async updateStaff(
    id: string,
    dto: UpdateUserDto,
    managerId: string,
  ): Promise<User> {
    const staff = await this.userRepository.findOne({
      where: { id, managerId, role: UserRole.STAFF },
    });

    if (!staff) {
      throw new NotFoundException("Staff member not found");
    }

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 12);
    }

    Object.assign(staff, dto);
    const saved = await this.userRepository.save(staff);
    delete (saved as any).password;
    return saved;
  }

  /**
   * Deactivate staff member
   */
  async deactivateStaff(id: string, managerId: string): Promise<User> {
    const staff = await this.userRepository.findOne({
      where: { id, managerId, role: UserRole.STAFF },
    });

    if (!staff) {
      throw new NotFoundException("Staff member not found");
    }

    staff.isActive = false;
    const saved = await this.userRepository.save(staff);
    delete (saved as any).password;
    return saved;
  }

  /**
   * Activate staff member
   */
  async activateStaff(id: string, managerId: string): Promise<User> {
    const staff = await this.userRepository.findOne({
      where: { id, managerId, role: UserRole.STAFF },
    });

    if (!staff) {
      throw new NotFoundException("Staff member not found");
    }

    staff.isActive = true;
    const saved = await this.userRepository.save(staff);
    delete (saved as any).password;
    return saved;
  }

  /**
   * Get staff statistics
   */
  async getStaffStats(staffId: string, managerId: string): Promise<any> {
    const staff = await this.userRepository.findOne({
      where: { id: staffId, managerId },
    });

    if (!staff) {
      throw new NotFoundException("Staff member not found");
    }

    const properties = await this.propertyRepository
      .createQueryBuilder("property")
      .innerJoin("property_staff", "ps", "ps.property_id = property.id")
      .leftJoinAndSelect("property.tenants", "tenant")
      .where("ps.staff_id = :staffId", { staffId })
      .getMany();

    const propertyCount = properties.length;
    const tenantCount = properties.reduce(
      (sum, property) => sum + (property.tenants?.length ?? 0),
      0,
    );

    return {
      staffId,
      propertyCount,
      tenantCount,
    };
  }

  /**
   * Find user by email (for auth)
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
    });
  }

  // ── General Manager management (Owner) ──

  /**
   * Create a new General Manager (Owner only)
   */
  async createManager(dto: CreateUserDto): Promise<User> {
    const existingUser = await this.userRepository.findOne({
      where: [{ email: dto.email }, { phone: dto.phone }],
    });

    if (existingUser) {
      throw new ConflictException(
        "User with this email or phone already exists",
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const manager = this.userRepository.create({
      ...dto,
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      role: UserRole.GENERAL_MANAGER,
      isActive: true,
    });

    const saved = await this.userRepository.save(manager);
    delete (saved as any).password;
    return saved;
  }

  /**
   * Get ALL general managers (Owner view)
   */
  async findAllManagers(): Promise<User[]> {
    const managers = await this.userRepository.find({
      where: { role: UserRole.GENERAL_MANAGER },
      order: { createdAt: "DESC" },
    });
    managers.forEach((m) => delete (m as any).password);
    return managers;
  }

  /**
   * Update general manager
   */
  async updateManager(id: string, dto: UpdateUserDto): Promise<User> {
    const manager = await this.userRepository.findOne({
      where: { id, role: UserRole.GENERAL_MANAGER },
    });

    if (!manager) {
      throw new NotFoundException("General manager not found");
    }

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 12);
    }

    Object.assign(manager, dto);
    const saved = await this.userRepository.save(manager);
    delete (saved as any).password;
    return saved;
  }

  /**
   * Deactivate general manager
   */
  async deactivateManager(id: string): Promise<User> {
    const manager = await this.userRepository.findOne({
      where: { id, role: UserRole.GENERAL_MANAGER },
    });

    if (!manager) {
      throw new NotFoundException("General manager not found");
    }

    manager.isActive = false;
    const saved = await this.userRepository.save(manager);
    delete (saved as any).password;
    return saved;
  }

  /**
   * Activate general manager
   */
  async activateManager(id: string): Promise<User> {
    const manager = await this.userRepository.findOne({
      where: { id, role: UserRole.GENERAL_MANAGER },
    });

    if (!manager) {
      throw new NotFoundException("General manager not found");
    }

    manager.isActive = true;
    const saved = await this.userRepository.save(manager);
    delete (saved as any).password;
    return saved;
  }
}
