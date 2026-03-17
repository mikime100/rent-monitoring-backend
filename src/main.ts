/**
 * NestJS Application Entry Point
 */

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security middleware should run before any early-return middleware (e.g. rate limiting)
  app.use(helmet());

  const allowedCorsOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const globalRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX ?? "1000", 10),
    keyGenerator: (req: Request) => `${req.ip}:${req.path}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests. Please try again later.",
    },
  });

  const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX ?? "200", 10),
    keyGenerator: (req: Request) => {
      const email = String(req.body?.email ?? "")
        .toLowerCase()
        .trim();
      return `${req.ip}:${req.path}:${email}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many login attempts. Please try again later.",
    },
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const isLoginRoute =
      req.method === "POST" &&
      (req.path === "/auth/login" || req.path === "/api/auth/login");

    if (isLoginRoute) {
      return loginRateLimiter(req, res, next);
    }

    return next();
  });

  app.use(globalRateLimiter);

  // Enable CORS
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (
        allowedCorsOrigins.length > 0 &&
        allowedCorsOrigins.includes(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix("api");

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle("Rent Monitoring API")
    .setDescription(
      "API documentation for Rent Monitoring and Management System",
    )
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  // Start server
  const port = process.env.PORT || 3000;
  const host = process.env.HOST || "0.0.0.0";
  await app.listen(port, host);

  console.log(`🚀 Application is running on: http://${host}:${port}`);
  console.log(`📚 Swagger docs available at: http://${host}:${port}/docs`);
}

bootstrap();
