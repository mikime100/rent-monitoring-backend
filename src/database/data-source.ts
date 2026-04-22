import "reflect-metadata";
import { DataSource } from "typeorm";
import * as dotenv from "dotenv";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

const AppDataSource = new DataSource({
  type: "postgres",
  url: databaseUrl || undefined,
  host: databaseUrl ? undefined : process.env.DB_HOST ?? "localhost",
  port: databaseUrl
    ? undefined
    : parseInt(process.env.DB_PORT ?? "5432", 10),
  username: databaseUrl ? undefined : process.env.DB_USERNAME ?? "postgres",
  password: databaseUrl ? undefined : process.env.DB_PASSWORD ?? "0000",
  database: databaseUrl ? undefined : process.env.DB_NAME ?? "rent_monitoring",
  synchronize: false,
  logging: false,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  entities: [__dirname + "/../entities/**/*.entity{.ts,.js}"],
  migrations: [__dirname + "/../migrations/*{.ts,.js}"],
});

export default AppDataSource;
