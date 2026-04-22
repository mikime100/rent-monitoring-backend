/**
 * Visitor Controller
 */

import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { VisitorService } from "./visitor.service";
import { CreateVisitorInviteLinkDto } from "./dto/create-visitor-invite-link.dto";
import { CreateVisitorPassDto } from "./dto/create-visitor-pass.dto";
import { VerifyVisitorPassDto } from "./dto/verify-visitor-pass.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../../entities";

interface AuthUser {
  sub: string;
  role: UserRole;
}

@ApiTags("Visitor Access")
@ApiBearerAuth()
@Controller("visitor")
@UseGuards(JwtAuthGuard, RolesGuard)
export class VisitorController {
  constructor(private readonly visitorService: VisitorService) {}

  @Post("links")
  @Roles(UserRole.TENANT)
  @ApiOperation({ summary: "Create a visitor invite link" })
  async createInviteLink(
    @Request() req: { user: AuthUser },
    @Body() dto: CreateVisitorInviteLinkDto,
  ) {
    const data = await this.visitorService.createInviteLink(req.user.sub, dto);
    return { success: true, data };
  }

  @Post("links/:linkId/passes")
  @Roles(UserRole.TENANT)
  @ApiOperation({ summary: "Create a visitor pass" })
  async createPass(
    @Request() req: { user: AuthUser },
    @Param("linkId") linkId: string,
    @Body() dto: CreateVisitorPassDto,
  ) {
    const data = await this.visitorService.createPass(
      req.user.sub,
      linkId,
      dto,
    );
    return { success: true, data };
  }

  @Post("verify")
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER, UserRole.GUARD)
  @ApiOperation({ summary: "Verify visitor pass" })
  async verifyPass(
    @Request() req: { user: AuthUser },
    @Body() dto: VerifyVisitorPassDto,
  ) {
    const data = await this.visitorService.verifyPass(req.user.sub, dto);
    return { success: true, data };
  }
}
