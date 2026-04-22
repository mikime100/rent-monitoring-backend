/**
 * Tenant Accounts Service
 */

import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { TenantAccount, Tenant, User, UserRole } from "../../entities";
import { CreateTenantAccountDto } from "./dto/create-tenant-account.dto";

@Injectable()
export class TenantAccountsService {
  private readonly SALT_ROUNDS = 12;

  constructor(
    @InjectRepository(TenantAccount)
    private readonly tenantAccountRepository: Repository<TenantAccount>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private normalizeUnitNumber(unitNumber: string): string {
    return unitNumber.trim().toLowerCase().replace(/\s+/g, " ");
  }

  async createTenantAccount(
    dto: CreateTenantAccountDto,
    userId: string,
    userRole: UserRole,
  ): Promise<{ account: TenantAccount; user: User }> {
    if (userRole !== UserRole.OWNER && userRole !== UserRole.GENERAL_MANAGER) {
      throw new ForbiddenException(
        "Only owner and general manager can create tenant accounts",
      );
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
      tenant.property?.managerId !== userId
    ) {
      throw new ForbiddenException("Access denied to this tenant");
    }

    const normalizedUnit = this.normalizeUnitNumber(tenant.unitNumber);

    const existingAccount = await this.tenantAccountRepository.findOne({
      where: { tenantId: tenant.id },
    });

    if (existingAccount) {
      throw new ConflictException("Tenant already has an account");
    }

    const existingUnitAccount = await this.tenantAccountRepository.findOne({
      where: {
        propertyId: tenant.propertyId,
        unitNumberNormalized: normalizedUnit,
        isActive: true,
      },
    });

    if (existingUnitAccount) {
      throw new ConflictException("An account already exists for this unit");
    }

    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException("User with this email already exists");
    }

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    return this.tenantAccountRepository.manager.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const accountRepo = manager.getRepository(TenantAccount);

      const tenantUser = userRepo.create({
        email: dto.email.toLowerCase(),
        firstName: tenant.firstName,
        lastName: tenant.lastName,
        phone: dto.phone ?? tenant.phone,
        password: passwordHash,
        role: UserRole.TENANT,
        isActive: true,
      });

      const savedUser = await userRepo.save(tenantUser);

      const account = accountRepo.create({
        userId: savedUser.id,
        tenantId: tenant.id,
        propertyId: tenant.propertyId,
        unitNumber: tenant.unitNumber,
        unitNumberNormalized: normalizedUnit,
        isActive: true,
      });

      const savedAccount = await accountRepo.save(account);
      delete (savedUser as any).password;

      return { account: savedAccount, user: savedUser };
    });
  }
}
