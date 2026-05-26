import { createServer } from "./server.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { WhatsAppClient } from "./baileys/client.js";
import { notifyWaServiceStatusChanged } from "./services/backendWebhook.js";

const whatsAppClient = new WhatsAppClient(config, logger);
whatsAppClient.setStatusChangeHandler((status, reason) =>
  notifyWaServiceStatusChanged(config, logger, {
    service: "wa-service",
    instanceId: "default",
    active: status.active,
    connected: status.connected,
    connection: status.connection,
    hasQr: status.hasQr,
    state: status.state,
    reason,
    changedAt: status.lastChangedAt,
  }),
);

if (config.waServiceAutoStart) {
  await whatsAppClient.start("startup");
} else {
  logger.info(
    { autoStart: false },
    "WhatsApp service auto-start disabled; waiting for manual activation",
  );
}

const app = createServer({ config, logger, whatsAppClient });
const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "WhatsApp adapter service listening");
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, "shutting down WhatsApp adapter service");

  server.close((error?: Error) => {
    if (error) {
      logger.error({ err: error }, "HTTP server shutdown failed");
      process.exitCode = 1;
    }
  });

  await whatsAppClient.stop();
  process.exit();
}

process.on("SIGINT", (signal) => {
  void shutdown(signal);
});

process.on("SIGTERM", (signal) => {
  void shutdown(signal);
});
