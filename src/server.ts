import express, { type Express } from "express";
import type { Logger } from "pino";
import type { AppConfig } from "./config.js";
import type { WhatsAppClient } from "./baileys/client.js";
import { createMessagesRouter } from "./routes/messages.js";
import { createV1Router } from "./routes/v1.js";
import { createWhatsAppRouter } from "./routes/whatsapp.js";
import {
  getDomainFromRequestOrigin,
  isAllowedRequestDomain,
} from "./utils/requestAuth.js";

export function createServer(params: {
  config: AppConfig;
  logger: Logger;
  whatsAppClient: WhatsAppClient;
}): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const origin = req.header("origin");
    const originDomain = origin ? getDomainFromRequestOrigin(origin) : null;
    const allowedOrigin =
      originDomain !== null &&
      isAllowedRequestDomain(originDomain, params.config.serviceAllowedDomains);

    if (origin) {
      const logPayload = {
        origin,
        originDomain,
        allowedOrigin,
        allowedDomains: params.config.serviceAllowedDomains,
      };

      if (allowedOrigin) {
        params.logger.info(logPayload, "CORS origin allowed");
      } else {
        params.logger.warn(logPayload, "CORS origin blocked");
      }
    }

    if (origin && allowedOrigin) {
      res.header("access-control-allow-origin", origin);
      res.header("vary", "Origin");
      res.header("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
      res.header(
        "access-control-allow-headers",
        "content-type,x-api-key,x-client-domain",
      );
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(
    "/v1",
    createV1Router({
      config: params.config,
      whatsAppClient: params.whatsAppClient,
    }),
  );

  app.use(
    "/messages",
    createMessagesRouter({
      config: params.config,
      logger: params.logger,
      whatsAppClient: params.whatsAppClient,
    }),
  );

  app.use(
    "/whatsapp",
    createWhatsAppRouter({
      config: params.config,
      whatsAppClient: params.whatsAppClient,
    }),
  );

  return app;
}
