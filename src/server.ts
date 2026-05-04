import express, { type Express } from "express";
import type { Logger } from "pino";
import type { AppConfig } from "./config.js";
import type { WhatsAppClient } from "./baileys/client.js";
import { createMessagesRouter } from "./routes/messages.js";

export function createServer(params: {
  config: AppConfig;
  logger: Logger;
  whatsAppClient: WhatsAppClient;
}): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(
    "/messages",
    createMessagesRouter({
      config: params.config,
      logger: params.logger,
      whatsAppClient: params.whatsAppClient
    })
  );

  return app;
}
