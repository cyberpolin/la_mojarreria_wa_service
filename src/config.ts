import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(currentDir, "../.env") });

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  SERVICE_API_KEY: z.string().min(1, "SERVICE_API_KEY is required"),
  MAIN_BACKEND_URL: z.string().url("MAIN_BACKEND_URL must be a valid URL"),
  MAIN_BACKEND_WEBHOOK_SECRET: z.string().min(1, "MAIN_BACKEND_WEBHOOK_SECRET is required"),
  WHATSAPP_AUTH_DIR: z.string().min(1).default("./auth")
});

const env = envSchema.parse(process.env);

export const config = {
  port: env.PORT,
  serviceApiKey: env.SERVICE_API_KEY,
  mainBackendUrl: env.MAIN_BACKEND_URL.replace(/\/+$/, ""),
  mainBackendWebhookSecret: env.MAIN_BACKEND_WEBHOOK_SECRET,
  whatsappAuthDir: env.WHATSAPP_AUTH_DIR
} as const;

export type AppConfig = typeof config;
