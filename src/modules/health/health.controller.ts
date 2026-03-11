/**
 * Health Controller
 * Provides health check endpoints
 */

import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { Response } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { HealthService, HealthStatus } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Overall health check
   */
  @Get()
  @Public()
  async check(): Promise<HealthStatus> {
    return this.healthService.getHealth();
  }

  /**
   * Liveness probe for Kubernetes
   */
  @Get("live")
  @Public()
  live(@Res() res: Response) {
    if (this.healthService.isAlive()) {
      return res.status(HttpStatus.OK).json({ status: "alive" });
    }
    return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ status: "dead" });
  }

  /**
   * Readiness probe for Kubernetes
   */
  @Get("ready")
  @Public()
  async ready(@Res() res: Response) {
    const isReady = await this.healthService.isReady();
    if (isReady) {
      return res.status(HttpStatus.OK).json({ status: "ready" });
    }
    return res
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .json({ status: "not-ready" });
  }
}
