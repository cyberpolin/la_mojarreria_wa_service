import { createServer } from "./server.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { WhatsAppClient } from "./baileys/client.js";

const whatsAppClient = new WhatsAppClient(config, logger);

await whatsAppClient.start();

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
