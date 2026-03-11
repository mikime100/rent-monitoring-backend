/**
 * Notifications Service
 * Handles push notifications via Firebase Cloud Messaging
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan } from "typeorm";
import { ConfigService } from "@nestjs/config";
import * as admin from "firebase-admin";
import { Notification, NotificationType, User } from "../../entities";

interface SendNotificationDto {
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  data?: Record<string, string>;
  relatedEntityId?: string;
  relatedEntityType?: string;
}

@Injectable()
export class NotificationsService {
  private firebaseInitialized = false;

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {
    this.initializeFirebase();
  }

  /**
   * Initialize Firebase Admin SDK
   */
  private initializeFirebase(): void {
    const projectId = this.configService.get<string>("firebase.projectId");
    const clientEmail = this.configService.get<string>("firebase.clientEmail");
    const privateKey = this.configService.get<string>("firebase.privateKey");

    if (projectId && clientEmail && privateKey) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, "\n"),
          }),
        });
        this.firebaseInitialized = true;
      } catch (error) {
        console.error("Failed to initialize Firebase:", error);
      }
    }
  }

  /**
   * Send push notification
   */
  async sendNotification(dto: SendNotificationDto): Promise<Notification> {
    const user = await this.userRepository.findOne({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Create notification record
    const notification = this.notificationRepository.create({
      userId: dto.userId,
      title: dto.title,
      message: dto.body,
      body: dto.body,
      type: dto.type,
      data: dto.data,
      relatedEntityId: dto.relatedEntityId,
      relatedEntityType: dto.relatedEntityType,
      isRead: false,
    });

    const savedNotification =
      await this.notificationRepository.save(notification);

    // Send FCM push notification if user has token
    if (user.fcmToken && this.firebaseInitialized) {
      try {
        await admin.messaging().send({
          token: user.fcmToken,
          notification: {
            title: dto.title,
            body: dto.body,
          },
          data: {
            notificationId: savedNotification.id,
            type: dto.type,
            ...(dto.data || {}),
          },
          android: {
            priority: "high",
            notification: {
              channelId: "rent-monitor-default",
            },
          },
          apns: {
            payload: {
              aps: {
                sound: "default",
                badge: 1,
              },
            },
          },
        });

        savedNotification.sentAt = new Date();
        await this.notificationRepository.save(savedNotification);
      } catch (error) {
        console.error("Failed to send push notification:", error);
        // Don't throw - notification is still saved
      }
    }

    return savedNotification;
  }

  /**
   * Send notification to multiple users
   */
  async sendBulkNotification(
    userIds: string[],
    title: string,
    body: string,
    type: NotificationType,
    data?: Record<string, string>,
  ): Promise<void> {
    await Promise.all(
      userIds.map((userId) =>
        this.sendNotification({ userId, title, body, type, data }),
      ),
    );
  }

  /**
   * Get notifications for user
   */
  async getNotifications(
    userId: string,
    limit: number = 50,
  ): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId },
      order: { createdAt: "DESC" },
      take: limit,
    });
  }

  /**
   * Get unread notifications count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException("Notification not found");
    }

    notification.isRead = true;
    notification.readAt = new Date();
    return this.notificationRepository.save(notification);
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
  }

  /**
   * Delete notification
   */
  async delete(id: string, userId: string): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException("Notification not found");
    }

    await this.notificationRepository.remove(notification);
  }

  /**
   * Delete old notifications
   */
  async deleteOldNotifications(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.notificationRepository.delete({
      createdAt: LessThan(cutoffDate),
    });

    return result.affected ?? 0;
  }

  /**
   * Send payment reminder
   */
  async sendPaymentReminder(
    userId: string,
    tenantName: string,
    amount: number,
    dueDate: Date,
  ): Promise<Notification> {
    return this.sendNotification({
      userId,
      title: "Payment Reminder",
      body: `Rent payment of $${amount} for ${tenantName} is due on ${dueDate.toLocaleDateString()}`,
      type: NotificationType.PAYMENT_REMINDER,
      data: {
        tenantName,
        amount: amount.toString(),
        dueDate: dueDate.toISOString(),
      },
    });
  }

  /**
   * Send payment received notification
   */
  async sendPaymentReceived(
    userId: string,
    tenantName: string,
    amount: number,
    paymentId: string,
  ): Promise<Notification> {
    return this.sendNotification({
      userId,
      title: "Payment Received",
      body: `Payment of $${amount} received from ${tenantName}`,
      type: NotificationType.PAYMENT_RECEIVED,
      relatedEntityId: paymentId,
      relatedEntityType: "payment",
      data: {
        tenantName,
        amount: amount.toString(),
      },
    });
  }

  /**
   * Send contract expiry reminder
   */
  async sendContractExpiryReminder(
    userId: string,
    tenantName: string,
    expiryDate: Date,
    tenantId: string,
  ): Promise<Notification> {
    return this.sendNotification({
      userId,
      title: "Contract Expiring Soon",
      body: `Contract for ${tenantName} expires on ${expiryDate.toLocaleDateString()}`,
      type: NotificationType.CONTRACT_EXPIRY,
      relatedEntityId: tenantId,
      relatedEntityType: "tenant",
      data: {
        tenantName,
        expiryDate: expiryDate.toISOString(),
      },
    });
  }
}
