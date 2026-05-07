import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
  type AnyMessageContent,
  type BaileysEventMap,
  type WASocket,
  type proto
} from "@whiskeysockets/baileys";
import type { Logger } from "pino";
import qrcode from "qrcode-terminal";
import type { AppConfig } from "../config.js";
import { getCampaignForPhone } from "../services/campaignStore.js";
import { notifySubscriptionReply } from "../services/backendWebhook.js";
import { recordConversationMessage } from "../services/conversationStore.js";
import { activateDummyRegistry } from "../services/dummyRegistryApi.js";
import { recordInboundContact } from "../services/inboundContactStore.js";
import { activateRegistry, getRegistryRecord } from "../services/registryStore.js";
import { dispatchWebhookEvent } from "../services/webhookDispatcher.js";
import { phoneFromWhatsAppJid, phoneToWhatsAppJid } from "../utils/phone.js";

type MessagesUpsert = BaileysEventMap["messages.upsert"];

function getDisconnectStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const output = "output" in error ? error.output : undefined;
  if (typeof output !== "object" || output === null || !("statusCode" in output)) {
    return undefined;
  }

  return typeof output.statusCode === "number" ? output.statusCode : undefined;
}

function getMessageText(message: proto.IMessage | null | undefined): string | null {
  if (!message) {
    return null;
  }

  if (message.conversation) {
    return message.conversation.trim();
  }

  if (message.extendedTextMessage?.text) {
    return message.extendedTextMessage.text.trim();
  }

  if (message.imageMessage?.caption) {
    return message.imageMessage.caption.trim();
  }

  if (message.videoMessage?.caption) {
    return message.videoMessage.caption.trim();
  }

  if (message.buttonsResponseMessage?.selectedDisplayText) {
    return message.buttonsResponseMessage.selectedDisplayText.trim();
  }

  if (message.buttonsResponseMessage?.selectedButtonId) {
    return message.buttonsResponseMessage.selectedButtonId.trim();
  }

  if (message.listResponseMessage?.title) {
    return message.listResponseMessage.title.trim();
  }

  return null;
}

function getMessageTimestamp(message: proto.IWebMessageInfo): string {
  const timestamp = message.messageTimestamp;

  if (typeof timestamp === "number") {
    return new Date(timestamp * 1000).toISOString();
  }

  if (typeof timestamp === "bigint") {
    return new Date(Number(timestamp) * 1000).toISOString();
  }

  return new Date().toISOString();
}

export class WhatsAppClient {
  private socket: WASocket | null = null;
  private isStopping = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private latestQr: string | null = null;
  private connectionStatus: "connecting" | "open" | "close" = "connecting";
  private phoneByLid = new Map<string, string>();

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger
  ) {}

  async start(): Promise<void> {
    this.isStopping = false;

    const { state, saveCreds } = await useMultiFileAuthState(this.config.whatsappAuthDir);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      logger: this.logger.child({ module: "baileys" }),
      browser: ["La Mojarreria", "Chrome", "1.0.0"]
    });

    this.socket = socket;

    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", (update) => {
      if (update.qr) {
        this.latestQr = update.qr;
        this.logger.info("Scan this QR code with WhatsApp to connect the service");
        qrcode.generate(update.qr, { small: true });
      }

      if (update.connection === "open") {
        this.latestQr = null;
        this.connectionStatus = "open";
        this.logger.info("WhatsApp socket connected");
      }

      if (update.connection === "close") {
        this.connectionStatus = "close";
        const statusCode = getDisconnectStatusCode(update.lastDisconnect?.error);
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        this.logger.warn({ statusCode, loggedOut }, "WhatsApp socket disconnected");

        if (!this.isStopping && !loggedOut) {
          this.scheduleReconnect();
        }
      }
    });

    socket.ev.on("messages.upsert", (event) => {
      void this.handleMessagesUpsert(event);
    });
    socket.ev.on("chats.phoneNumberShare", ({ lid, jid }) => {
      const phone = phoneFromWhatsAppJid(jid);
      if (phone) {
        this.phoneByLid.set(lid, phone);
      }
    });
  }

  async stop(): Promise<void> {
    this.isStopping = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.end(undefined);
      this.socket = null;
    }
  }

  async sendSubscriptionMessage(params: {
    name: string;
    phone: string;
  }): Promise<string> {
    return this.sendTextMessage({
      phone: params.phone,
      text: `Hola ${params.name}, gracias por registrarte en La Mojarrería. Responde SI para confirmar tu registro y recibir tus papas gratis.`
    });
  }

  async sendAlreadyRegisteredMessage(params: {
    phone: string;
  }): Promise<string> {
    return this.sendTextMessage({
      phone: params.phone,
      text: "Este número ya está registrado. Si aún no has pedido tus papas gratis, solo haz un pedido. Si ya las usaste, estate pendiente, pronto te enviaremos promociones."
    });
  }

  async sendTextMessage(params: { phone: string; text: string }): Promise<string> {
    if (!this.socket) {
      throw new Error("WhatsApp socket is not initialized");
    }

    const content: AnyMessageContent = {
      text: params.text
    };

    const response = await this.socket.sendMessage(phoneToWhatsAppJid(params.phone), content);
    const messageId = response?.key.id;

    if (!messageId) {
      throw new Error("WhatsApp did not return a message id");
    }

    await recordConversationMessage({
      filePath: this.config.conversationStoreFile,
      phone: params.phone,
      text: params.text,
      messageId,
      direction: "outbound",
      timestamp: new Date().toISOString()
    });

    return messageId;
  }

  getStatus(): {
    connected: boolean;
    connection: "connecting" | "open" | "close";
    hasQr: boolean;
  } {
    return {
      connected: this.connectionStatus === "open",
      connection: this.connectionStatus,
      hasQr: this.latestQr !== null
    };
  }

  getLatestQr(): string | null {
    return this.latestQr;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.start().catch((error: unknown) => {
        this.logger.error({ err: error }, "failed to reconnect WhatsApp socket");
        this.scheduleReconnect();
      });
    }, 5000);
  }

  private async handleMessagesUpsert(event: MessagesUpsert): Promise<void> {
    if (event.type !== "notify") {
      return;
    }

    await Promise.all(event.messages.map((message) => this.handleIncomingMessage(message)));
  }

  private async handleIncomingMessage(message: proto.IWebMessageInfo): Promise<void> {
    this.logger.info({ id: message.key.id, from: message.key }, "received WhatsApp message");
    if (message.key.fromMe) {
      return;
    }

    const remoteJid = message.key.remoteJid;
    if (!remoteJid || remoteJid.endsWith("@g.us")) {
      return;
    }

    const phone = this.getPhoneFromRemoteJid(remoteJid);
    const text = getMessageText(message.message);
    const messageId = message.key.id;

    if (!phone || !text || !messageId) {
      return;
    }

    const timestamp = getMessageTimestamp(message);
    const conversationMessage = await recordConversationMessage({
      filePath: this.config.conversationStoreFile,
      phone,
      text,
      messageId,
      direction: "inbound",
      timestamp
    });
    await recordInboundContact({
      filePath: this.config.inboundContactsStoreFile,
      phone,
      text,
      messageId,
      receivedAt: timestamp
    });

    const existingRecord = await getRegistryRecord(this.config.registryStoreFile, phone);
    const campaignKey = getCampaignForPhone(phone) ?? existingRecord?.campaignKey ?? null;
    const payload = {
      phone,
      text,
      messageId,
      timestamp,
      source: "baileys" as const,
      campaignKey
    };

    const registryRecord = await activateRegistry({
      filePath: this.config.registryStoreFile,
      phone,
      campaignKey: payload.campaignKey
    });
    if (registryRecord) {
      await activateDummyRegistry({
        baseUrl: this.config.dummyRegistryApiUrl,
        logger: this.logger,
        record: registryRecord
      });
    }

    try {
      await notifySubscriptionReply(this.config, this.logger, payload);
      this.logger.info({ phone, messageId }, "forwarded WhatsApp reply to main backend");
    } catch (error) {
      this.logger.error({ err: error, phone, messageId }, "failed to forward WhatsApp reply");
    }

    await dispatchWebhookEvent({
      filePath: this.config.webhookSubscriptionsFile,
      logger: this.logger,
      event: "message.received",
      payload: {
        event: "message.received",
        provider: "baileys",
        message: conversationMessage
      }
    });
  }

  private getPhoneFromRemoteJid(remoteJid: string): string | null {
    return phoneFromWhatsAppJid(remoteJid) ?? this.phoneByLid.get(remoteJid) ?? null;
  }
}
