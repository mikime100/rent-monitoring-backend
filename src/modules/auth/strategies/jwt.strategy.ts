/**
 * JWT Strategy for Passport
 */

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { AuthService, JwtPayload } from "../auth.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("jwt.secret"),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.authService.validateUser(payload.sub);

    if (!user) {
      throw new UnauthorizedException("User not found or inactive");
    }

    if (this.authService.isAccessTokenRevoked(payload)) {
      throw new UnauthorizedException("Token has been revoked");
    }

    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      managerId: user.managerId,
      tokenVersion: payload.tokenVersion,
      iat: payload.iat,
      exp: payload.exp,
      jti: payload.jti,
    };
  }
}
