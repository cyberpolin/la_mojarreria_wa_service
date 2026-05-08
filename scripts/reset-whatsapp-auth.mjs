import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: resolve(process.cwd(), ".env") });

const confirmed = process.argv.includes("--yes");
const authDir = resolve(
  process.cwd(),
  process.env.WHATSAPP_AUTH_DIR || "./auth",
);

if (!confirmed) {
  console.error(
    "This deletes the WhatsApp auth/session files and forces a new QR pairing.",
  );
  console.error("Run again with: pnpm reset:whatsapp -- --yes");
  process.exit(1);
}

if (!existsSync(authDir)) {
  console.log(`No WhatsApp auth directory found at ${authDir}`);
  process.exit(0);
}

await rm(authDir, { recursive: true, force: true });
console.log(`Deleted WhatsApp auth directory: ${authDir}`);
