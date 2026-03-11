/**
 * Application Configuration
 */

export default () => ({
  port: parseInt(process.env.PORT ?? "3000", 10),

  database: {
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    username: process.env.DB_USERNAME ?? "postgres",
    password: process.env.DB_PASSWORD ?? "password",
    name: process.env.DB_NAME ?? "rent_monitoring",
    synchronize: process.env.DB_SYNCHRONIZE === "true",
    logging: process.env.DB_LOGGING === "true",
    ssl: process.env.DB_SSL === "true",
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? "your-secret-key-change-in-production",
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  },

  cors: {
    origins: process.env.CORS_ORIGINS?.split(",") ?? ["*"],
  },
});
