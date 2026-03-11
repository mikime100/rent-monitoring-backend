/**
 * Complaints Service
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Complaint,
  ComplaintStatus,
  User,
  UserRole,
  NotificationType,
} from "../../entities";
import { CreateComplaintDto } from "./dto/create-complaint.dto";
import { RespondComplaintDto } from "./dto/respond-complaint.dto";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class ComplaintsService {
  constructor(
    @InjectRepository(Complaint)
    private readonly complaintRepository: Repository<Complaint>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Create a complaint (Staff or GM)
   */
  async create(dto: CreateComplaintDto, creatorId: string): Promise<Complaint> {
    const complaint = this.complaintRepository.create({
      ...dto,
      staffId: creatorId,
      status: ComplaintStatus.OPEN,
    });

    const saved = await this.complaintRepository.save(complaint);

    try {
      const creator = await this.userRepository.findOne({
        where: { id: creatorId },
      });

      const creatorName = creator
        ? `${creator.firstName} ${creator.lastName}`
        : "A user";

      if (creator?.role === UserRole.GENERAL_MANAGER) {
        // GM created a complaint → notify owner(s) with special notification
        const owners = await this.userRepository.find({
          where: { role: UserRole.OWNER, isActive: true },
        });

        for (const owner of owners) {
          await this.notificationsService.sendNotification({
            userId: owner.id,
            title: `GM Report: ${saved.title}`,
            body: `General Manager ${creatorName} reported an issue: ${saved.title}`,
            type: NotificationType.COMPLAINT_GM_REPORT,
            relatedEntityId: saved.id,
            relatedEntityType: "complaint",
            data: {
              complaintId: saved.id,
              status: saved.status,
              fromGM: "true",
            },
          });
        }
      } else {
        // Staff created a complaint → notify the GM(s)
        let gmUsers: User[] = [];
        if (creator?.managerId) {
          const manager = await this.userRepository.findOne({
            where: { id: creator.managerId },
          });
          if (manager) gmUsers = [manager];
        }
        if (gmUsers.length === 0) {
          gmUsers = await this.userRepository.find({
            where: { role: UserRole.GENERAL_MANAGER, isActive: true },
          });
        }

        for (const gm of gmUsers) {
          await this.notificationsService.sendNotification({
            userId: gm.id,
            title: `New Complaint: ${saved.title}`,
            body: `${creatorName} submitted a complaint: ${saved.title}`,
            type: NotificationType.COMPLAINT_SUBMITTED,
            relatedEntityId: saved.id,
            relatedEntityType: "complaint",
            data: {
              complaintId: saved.id,
              status: saved.status,
            },
          });
        }
      }
    } catch {
      // Notification failure should not block complaint creation
    }

    return saved;
  }

  /**
   * Get all complaints - filtered by role
   */
  async findAll(userId: string, userRole: UserRole): Promise<Complaint[]> {
    if (userRole === UserRole.STAFF) {
      // Staff sees only their own complaints
      return this.complaintRepository.find({
        where: { staffId: userId },
        relations: ["staff", "respondedBy", "property"],
        order: { createdAt: "DESC" },
      });
    }

    // Owner and GM see all complaints
    return this.complaintRepository.find({
      relations: ["staff", "respondedBy", "property"],
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Get complaints for a specific property
   */
  async findByProperty(propertyId: string): Promise<Complaint[]> {
    return this.complaintRepository.find({
      where: { propertyId },
      relations: ["staff", "respondedBy"],
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Get complaint by ID
   */
  async findById(
    id: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Complaint> {
    const complaint = await this.complaintRepository.findOne({
      where: { id },
      relations: ["staff", "respondedBy"],
    });

    if (!complaint) {
      throw new NotFoundException("Complaint not found");
    }

    // Staff can only view their own complaints
    if (userRole === UserRole.STAFF && complaint.staffId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    return complaint;
  }

  /**
   * Respond to a complaint
   * - GM can respond to staff complaints but NOT their own
   * - Owner can respond to GM complaints
   */
  async respond(
    id: string,
    dto: RespondComplaintDto,
    responderId: string,
    responderRole: UserRole,
  ): Promise<Complaint> {
    const complaint = await this.complaintRepository.findOne({
      where: { id },
      relations: ["staff", "respondedBy"],
    });

    if (!complaint) {
      throw new NotFoundException("Complaint not found");
    }

    // GM cannot respond to their own complaints
    if (responderRole === UserRole.GENERAL_MANAGER && complaint.staffId === responderId) {
      throw new ForbiddenException("You cannot respond to your own complaint");
    }

    // Owner can only respond to GM complaints
    if (responderRole === UserRole.OWNER) {
      const creator = await this.userRepository.findOne({ where: { id: complaint.staffId } });
      if (creator?.role !== UserRole.GENERAL_MANAGER) {
        throw new ForbiddenException("Owner can only respond to General Manager complaints");
      }
    }

    complaint.response = dto.response;
    complaint.status = dto.status ?? ComplaintStatus.IN_PROGRESS;
    complaint.respondedById = responderId;
    complaint.respondedAt = new Date();

    const saved = await this.complaintRepository.save(complaint);

    // Send notification to the staff member who filed the complaint
    const statusLabel =
      saved.status === ComplaintStatus.RESOLVED
        ? "Resolved"
        : saved.status === ComplaintStatus.IN_PROGRESS
          ? "In Progress"
          : saved.status;

    try {
      await this.notificationsService.sendNotification({
        userId: saved.staffId,
        title: `Complaint ${statusLabel}: ${saved.title}`,
        body: dto.response,
        type: NotificationType.COMPLAINT_RESPONSE,
        relatedEntityId: saved.id,
        relatedEntityType: "complaint",
        data: {
          complaintId: saved.id,
          status: saved.status,
        },
      });
    } catch {
      // Notification failure should not block the response
    }

    return saved;
  }

  /**
   * Get complaint statistics
   */
  async getStats(): Promise<{
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
  }> {
    const complaints = await this.complaintRepository.find();

    return {
      total: complaints.length,
      open: complaints.filter((c) => c.status === ComplaintStatus.OPEN).length,
      inProgress: complaints.filter(
        (c) => c.status === ComplaintStatus.IN_PROGRESS,
      ).length,
      resolved: complaints.filter((c) => c.status === ComplaintStatus.RESOLVED)
        .length,
    };
  }
}
