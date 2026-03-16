/**
 * Payments Controller
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  UseGuards,
  Request,
} from "@nestjs/common";
import { PaymentsService, PaymentSummary } from "./payments.service";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { UpdatePaymentDto } from "./dto/update-payment.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../../entities";

@Controller("payments")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Create new payment record
   */
  @Post()
  create(@Body() dto: CreatePaymentDto, @Request() req: any) {
    return this.paymentsService.create(dto, req.user.sub, req.user.role);
  }

  /**
   * Get all payments
   */
  @Get()
  async findAll(@Request() req: any) {
    const payments = await this.paymentsService.findAll(
      req.user.sub,
      req.user.role,
    );
    return { success: true, data: payments };
  }

  /**
   * Batch mark multiple payments as paid
   */
  @Patch("batch/mark-paid")
  batchMarkAsPaid(
    @Body() body: { ids: string[]; paymentMethod?: string },
    @Request() req: any,
  ) {
    return this.paymentsService.batchMarkAsPaid(
      body.ids,
      req.user.sub,
      req.user.role,
      body.paymentMethod,
    );
  }

  /**
   * Get payment by ID
   */
  @Get(":id")
  findById(@Param("id", ParseUUIDPipe) id: string, @Request() req: any) {
    return this.paymentsService.findById(id, req.user.sub, req.user.role);
  }

  /**
   * Get payments by month and year
   */
  @Get("month/:year/:month")
  findByMonthYear(
    @Param("year", ParseIntPipe) year: number,
    @Param("month", ParseIntPipe) month: number,
    @Request() req: any,
  ) {
    return this.paymentsService.findByMonthYear(
      month,
      year,
      req.user.sub,
      req.user.role,
    );
  }

  /**
   * Get payments by tenant
   */
  @Get("tenant/:tenantId")
  findByTenant(
    @Param("tenantId", ParseUUIDPipe) tenantId: string,
    @Request() req: any,
  ) {
    return this.paymentsService.findByTenant(
      tenantId,
      req.user.sub,
      req.user.role,
    );
  }

  /**
   * Get payments by property
   */
  @Get("property/:propertyId")
  findByProperty(
    @Param("propertyId", ParseUUIDPipe) propertyId: string,
    @Request() req: any,
  ) {
    return this.paymentsService.findByProperty(
      propertyId,
      req.user.sub,
      req.user.role,
    );
  }

  /**
   * Get overdue payments
   */
  @Get("status/overdue")
  findOverdue(@Request() req: any) {
    return this.paymentsService.findOverdue(req.user.sub, req.user.role);
  }

  /**
   * Get recent payments
   */
  @Get("status/recent")
  findRecent(@Request() req: any, @Query("limit") limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.paymentsService.findRecent(
      parsedLimit,
      req.user.sub,
      req.user.role,
    );
  }

  /**
   * Get payment summary for month
   */
  @Get("summary/:year/:month")
  getMonthSummary(
    @Param("year", ParseIntPipe) year: number,
    @Param("month", ParseIntPipe) month: number,
    @Request() req: any,
    @Query("propertyId") propertyId?: string,
  ): Promise<PaymentSummary> {
    return this.paymentsService.getMonthSummary(
      month,
      year,
      req.user.sub,
      req.user.role,
      propertyId,
    );
  }

  /**
   * Update payment
   */
  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentDto,
    @Request() req: any,
  ) {
    return this.paymentsService.update(id, dto, req.user.sub, req.user.role);
  }

  /**
   * Mark payment as paid
   */
  @Patch(":id/mark-paid")
  markAsPaid(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { paymentMethod?: string; transactionReference?: string },
    @Request() req: any,
  ) {
    return this.paymentsService.markAsPaid(
      id,
      req.user.sub,
      req.user.role,
      body.paymentMethod,
      body.transactionReference,
    );
  }

  /**
   * Record partial payment
   */
  @Patch(":id/partial")
  recordPartialPayment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { amount: number; paymentMethod?: string },
    @Request() req: any,
  ) {
    return this.paymentsService.recordPartialPayment(
      id,
      req.user.sub,
      req.user.role,
      body.amount,
      body.paymentMethod,
    );
  }

  /**
   * Update all overdue statuses
   */
  @Post("update-overdue")
  updateOverdueStatuses(@Request() req: any) {
    return this.paymentsService.updateOverdueStatuses(
      req.user.sub,
      req.user.role,
    );
  }
}
