/**
 * Health Service
 * Provides health check functionality
 */

import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { InjectDataSource } from "@nestjs/typeorm";

export interface HealthStatus {
  status: "healthy" | "unhealthy";
  timestamp: string;
  uptime: number;
  database: {
    status: "connected" | "disconnected";
    latency?: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
}

@Injectable()
export class HealthService {
  private readonly startTime: number;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    this.startTime = Date.now();
  }

  /**
   * Get overall health status
   */
  async getHealth(): Promise<HealthStatus> {
    const dbHealth = await this.checkDatabase();
    const memoryInfo = this.getMemoryInfo();

    return {
      status: dbHealth.status === "connected" ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      database: dbHealth,
      memory: memoryInfo,
    };
  }

  /**
   * Check database connectivity
   */
  async checkDatabase(): Promise<{
    status: "connected" | "disconnected";
    latency?: number;
  }> {
    try {
      const start = Date.now();
      await this.dataSource.query("SELECT 1");
      const latency = Date.now() - start;
      return { status: "connected", latency };
    } catch (error) {
      return { status: "disconnected" };
    }
  }

  /**
   * Get memory usage info
   */
  getMemoryInfo(): { used: number; total: number; percentage: number } {
    const memUsage = process.memoryUsage();
    const used = Math.round(memUsage.heapUsed / 1024 / 1024);
    const total = Math.round(memUsage.heapTotal / 1024 / 1024);
    const percentage = Math.round((used / total) * 100);

    return { used, total, percentage };
  }

  /**
   * Simple liveness check
   */
  isAlive(): boolean {
    return true;
  }

  /**
   * Readiness check (database must be connected)
   */
  async isReady(): Promise<boolean> {
    try {
      await this.dataSource.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }
}
