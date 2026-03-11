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

@Controller("payments")
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Create new payment record
   */
  @Post()
  create(@Body() dto: CreatePaymentDto, @Request() req: any) {
    return this.paymentsService.create(dto, req.user.id);
  }

  /**
   * Get all payments
   */
  @Get()
  async findAll() {
    const payments = await this.paymentsService.findAll();
    return { success: true, data: payments };
  }

  /**
   * Batch mark multiple payments as paid
   */
  @Patch("batch/mark-paid")
  batchMarkAsPaid(
    @Body() body: { ids: string[]; paymentMethod?: string },
  ) {
    return this.paymentsService.batchMarkAsPaid(body.ids, body.paymentMethod);
  }

  /**
   * Get payment by ID
   */
  @Get(":id")
  findById(@Param("id", ParseUUIDPipe) id: string) {
    return this.paymentsService.findById(id);
  }

  /**
   * Get payments by month and year
   */
  @Get("month/:year/:month")
  findByMonthYear(
    @Param("year", ParseIntPipe) year: number,
    @Param("month", ParseIntPipe) month: number,
  ) {
    return this.paymentsService.findByMonthYear(month, year);
  }

  /**
   * Get payments by tenant
   */
  @Get("tenant/:tenantId")
  findByTenant(@Param("tenantId", ParseUUIDPipe) tenantId: string) {
    return this.paymentsService.findByTenant(tenantId);
  }

  /**
   * Get payments by property
   */
  @Get("property/:propertyId")
  findByProperty(@Param("propertyId", ParseUUIDPipe) propertyId: string) {
    return this.paymentsService.findByProperty(propertyId);
  }

  /**
   * Get overdue payments
   */
  @Get("status/overdue")
  findOverdue() {
    return this.paymentsService.findOverdue();
  }

  /**
   * Get recent payments
   */
  @Get("status/recent")
  findRecent(@Query("limit") limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.paymentsService.findRecent(parsedLimit);
  }

  /**
   * Get payment summary for month
   */
  @Get("summary/:year/:month")
  getMonthSummary(
    @Param("year", ParseIntPipe) year: number,
    @Param("month", ParseIntPipe) month: number,
    @Query("propertyId") propertyId?: string,
  ): Promise<PaymentSummary> {
    return this.paymentsService.getMonthSummary(month, year, propertyId);
  }

  /**
   * Update payment
   */
  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.paymentsService.update(id, dto);
  }

  /**
   * Mark payment as paid
   */
  @Patch(":id/mark-paid")
  markAsPaid(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { paymentMethod?: string; transactionReference?: string },
  ) {
    return this.paymentsService.markAsPaid(
      id,
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
  ) {
    return this.paymentsService.recordPartialPayment(
      id,
      body.amount,
      body.paymentMethod,
    );
  }

  /**
   * Update all overdue statuses
   */
  @Post("update-overdue")
  updateOverdueStatuses() {
    return this.paymentsService.updateOverdueStatuses();
  }
}
