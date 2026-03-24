/**
 * Authentication Controller
 */

import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";

import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdateFcmTokenDto } from "./dto/update-fcm-token.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}



  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Login with email and password" })
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto);
    return {
      success: true,
      data: result,
    };
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Logout current user" })
  async logout(
    @Request()
    req: {
      user: { sub: string; jti?: string; exp?: number };
    },
  ) {
    await this.authService.logout(req.user.sub, req.user.jti, req.user.exp);
    return {
      success: true,
      message: "Logged out successfully",
    };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Refresh access token" })
  async refresh(@Body() dto: RefreshTokenDto) {
    // Verify refresh token JWT signature + expiry, then extract userId
    let userId: string;
    try {
      const decoded = this.authService.verifyToken(dto.refreshToken);
      userId = decoded.sub;
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const tokens = await this.authService.refreshTokens(
      userId,
      dto.refreshToken,
    );
    return {
      success: true,
      data: tokens,
    };
  }

  @Get("profile")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user profile" })
  async getProfile(@Request() req: { user: { sub: string } }) {
    const user = await this.authService.validateUser(req.user.sub);
    return {
      success: true,
      data: user,
    };
  }

  @Post("change-password")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change password" })
  async changePassword(
    @Request() req: { user: { sub: string } },
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(
      req.user.sub,
      dto.oldPassword,
      dto.newPassword,
    );
    return {
      success: true,
      message: "Password changed successfully",
    };
  }

  @Patch("fcm-token")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update FCM token for push notifications" })
  async updateFcmToken(
    @Request() req: { user: { sub: string } },
    @Body() dto: UpdateFcmTokenDto,
  ) {
    await this.authService.updateFcmToken(req.user.sub, dto.fcmToken);
    return {
      success: true,
      message: "FCM token updated",
    };
  }

  @Get("verify")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Verify access token is valid" })
  async verifyToken() {
    return {
      success: true,
      data: { valid: true },
    };
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Request password reset OTP" })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return {
      success: true,
      message:
        "If an account with that email exists, a reset code has been sent.",
    };
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reset password using OTP" })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.otp, dto.newPassword);
    return {
      success: true,
      message: "Password reset successfully. Please login with your new password.",
    };
  }
}
