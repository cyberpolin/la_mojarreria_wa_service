import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(currentDir, "../.env") });

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  SERVICE_API_KEY: z.string().min(1, "SERVICE_API_KEY is required"),
  SERVICE_ALLOWED_DOMAINS: z.string().min(1).default("lamojarreria.com,localhost,127.0.0.1"),
  MAIN_BACKEND_URL: z.string().url("MAIN_BACKEND_URL must be a valid URL"),
  MAIN_BACKEND_WEBHOOK_SECRET: z.string().min(1, "MAIN_BACKEND_WEBHOOK_SECRET is required"),
  WHATSAPP_AUTH_DIR: z.string().min(1).default("./auth"),
  REGISTRY_STORE_FILE: z.string().min(1).default("./data/registrations.json"),
  INBOUND_CONTACTS_STORE_FILE: z.string().min(1).default("./data/inbound-contacts.json"),
  DUMMY_REGISTRY_API_URL: z.string().url().optional().or(z.literal(""))
});

const env = envSchema.parse(process.env);

export const config = {
  port: env.PORT,
  serviceApiKey: env.SERVICE_API_KEY,
  serviceAllowedDomains: env.SERVICE_ALLOWED_DOMAINS.split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean),
  mainBackendUrl: env.MAIN_BACKEND_URL.replace(/\/+$/, ""),
  mainBackendWebhookSecret: env.MAIN_BACKEND_WEBHOOK_SECRET,
  whatsappAuthDir: env.WHATSAPP_AUTH_DIR,
  registryStoreFile: env.REGISTRY_STORE_FILE,
  inboundContactsStoreFile: env.INBOUND_CONTACTS_STORE_FILE,
  dummyRegistryApiUrl: env.DUMMY_REGISTRY_API_URL ? env.DUMMY_REGISTRY_API_URL.replace(/\/+$/, "") : null
} as const;

export type AppConfig = typeof config;
