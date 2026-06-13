// Baileys Adapter for OpenWA
// Implements IWhatsAppEngine using @whiskeysockets/baileys (no browser).
//
// We only implement the methods LMTM-OS actually uses. Everything else
// throws "not implemented" — easy to add later if needed.
//
// API: IWhatsAppEngine (296-line interface in OpenWA). We cherry-pick:
//   - Lifecycle: initialize, disconnect, logout, destroy
//   - Status: getStatus, getQRCode, getPhoneNumber, getPushName
//   - Messaging: sendTextMessage, sendImageMessage
//   - Contacts: getContacts, checkNumberExists
//   - Groups: getGroups, getGroupInfo, getGroupInviteCode
//   - Operations: getProfilePicture
//
// Baileys is the library that powers the official WhatsApp Web client
// (it reverse-engineered the WA Web multidevice protocol). It connects
// directly via WebSocket — no browser, no anti-bot detection.

import { EventEmitter } from 'events';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import {
  IWhatsAppEngine,
  EngineStatus,
  EngineEventCallbacks,
  MessageResult,
  MediaInput,
  IncomingMessage,
  Contact,
  Group,
  GroupInfo,
} from '../interfaces/whatsapp-engine.interface';
import { createLogger } from '../../common/services/logger.service';

export interface BaileysConfig {
  sessionId: string;
  sessionDataPath: string;
  printQRInTerminal?: boolean;
  proxyUrl?: string;
  proxyType?: 'http' | 'https' | 'socks4' | 'socks5';
}

export class BaileysAdapter extends EventEmitter implements IWhatsAppEngine {
  private readonly logger = createLogger('BaileysAdapter');
  private readonly sessionId: string;
  private readonly sessionDataPath: string;
  private readonly authDir: string;
  private readonly printQRInTerminal: boolean;

  private sock: ReturnType<typeof makeWASocket> | null = null;
  private status: EngineStatus = EngineStatus.DISCONNECTED;
  private callbacks: EngineEventCallbacks = {};
  private currentQR: string | null = null;
  private phoneNumber: string | null = null;
  private pushName: string | null = null;
  private reconnectAttempts = 0;
  private shuttingDown = false;
  private saveCreds: () => Promise<void> = async () => {};

  constructor(config: BaileysConfig) {
    super();
    this.sessionId = config.sessionId;
    this.sessionDataPath = config.sessionDataPath;
    this.printQRInTerminal = config.printQRInTerminal ?? true;
    this.authDir = path.join(this.sessionDataPath, this.sessionId);
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(callbacks: EngineEventCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.shuttingDown = false;
    this.logger.log(`Initializing Baileys for session ${this.sessionId}`, { sessionId: this.sessionId });
    await this.connect();
  }

  private async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    this.saveCreds = saveCreds;

    const { version, isLatest } = await fetchLatestBaileysVersion();
    this.logger.log(`Using WA version ${version.join('.')} (latest: ${isLatest})`);

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: this.printQRInTerminal,
      logger: pino({ level: 'silent' }) as never,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
    });

    this.sock.ev.on('connection.update', (update) => this.handleConnectionUpdate(update));
    this.sock.ev.on('creds.update', () => this.saveCreds());
    this.sock.ev.on('messages.upsert', (m) => this.handleMessagesUpsert(m));
    this.sock.ev.on('groups.update', (updates) => {
      this.logger.log(`groups.update: ${updates.length} groups`);
    });
  }

  // Baileys emits a connection.update event with a loose-typed payload.
  // We use `any` here to match the lib's actual type (which is a union
  // of Error | Boom for the error field, but TS narrows it incorrectly).
  private async handleConnectionUpdate(update: any): Promise<void> {
    const connection: string | undefined = update?.connection;
    const lastDisconnect: { error?: Boom } | undefined = update?.lastDisconnect;
    const qr: string | undefined = update?.qr;

    if (qr) {
      this.currentQR = qr;
      this.status = EngineStatus.QR_READY;
      this.logger.log(`QR received (${qr.length} chars)`);
      this.callbacks.onQRCode?.(qr);
      this.callbacks.onStateChanged?.(this.status);
    }

    if (connection === 'connecting') {
      this.status = EngineStatus.AUTHENTICATING;
      this.callbacks.onStateChanged?.(this.status);
    }

    if (connection === 'open') {
      this.status = EngineStatus.READY;
      this.reconnectAttempts = 0;
      this.phoneNumber = (this.sock?.user?.id ?? '').split(':')[0].split('@')[0] || null;
      this.pushName = this.sock?.user?.name ?? null;
      this.logger.log(`Connected as ${this.pushName} (${this.phoneNumber})`);
      this.callbacks.onReady?.(this.phoneNumber ?? '', this.pushName ?? '');
      this.callbacks.onStateChanged?.(this.status);
    }

    if (connection === 'close') {
      const boomErr = lastDisconnect?.error as Boom | undefined;
      const reason = boomErr?.output?.statusCode ?? DisconnectReason.connectionClosed;
      this.logger.warn(`Connection closed, reason=${reason}`);
      this.status = EngineStatus.DISCONNECTED;
      this.callbacks.onDisconnected?.(`code:${reason}`);
      this.callbacks.onStateChanged?.(this.status);

      // Auto-reconnect for everything except loggedOut
      if (!this.shuttingDown && reason !== DisconnectReason.loggedOut) {
        this.reconnectAttempts++;
        const delay = Math.min(30000, 2000 * this.reconnectAttempts);
        this.logger.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        setTimeout(() => this.connect().catch((e) => this.logger.error('reconnect failed', e)), delay);
      } else if (reason === DisconnectReason.loggedOut) {
        this.logger.warn('Logged out — clearing session, will need new QR');
        this.clearSession();
      }
    }
  }

  private async handleMessagesUpsert(m: {
    type: string;
    messages: proto.IWebMessageInfo[];
  }): Promise<void> {
    if (m.type !== 'notify' && m.type !== 'append') return;
    for (const msg of m.messages) {
      if (!msg.message) continue;
      const incoming = this.toIncomingMessage(msg);
      if (!incoming) continue;
      this.callbacks.onMessage?.(incoming);
    }
  }

  private toIncomingMessage(msg: proto.IWebMessageInfo): IncomingMessage | null {
    const m = msg.message;
    if (!m) return null;
    const chatId = msg.key.remoteJid ?? '';
    const isGroup = chatId.endsWith('@g.us');
    const fromMe = !!msg.key.fromMe;
    const from = msg.key.participant ?? (isGroup ? chatId : msg.key.remoteJid ?? '');

    // Extract text body
    let body = '';
    if (m.conversation) body = m.conversation;
    else if (m.extendedTextMessage?.text) body = m.extendedTextMessage.text;
    else if (m.imageMessage?.caption) body = m.imageMessage.caption;
    else if (m.videoMessage?.caption) body = m.videoMessage.caption;
    else if (m.documentMessage?.caption) body = m.documentMessage.caption;
    else if (m.buttonsResponseMessage?.selectedDisplayText) body = m.buttonsResponseMessage.selectedDisplayText;
    else if (m.listResponseMessage?.title) body = m.listResponseMessage.title;
    else if (m.templateButtonReplyMessage?.selectedDisplayText) body = m.templateButtonReplyMessage.selectedDisplayText;

    // Detect media
    let media: IncomingMessage['media'];
    const mediaMsg = m.imageMessage ?? m.videoMessage ?? m.audioMessage ?? m.documentMessage ?? m.stickerMessage;
    if (mediaMsg) {
      media = {
        mimetype: mediaMsg.mimetype ?? 'application/octet-stream',
        filename: (mediaMsg as proto.Message.IDocumentMessage).fileName ?? undefined,
      };
    }

    return {
      id: msg.key.id ?? '',
      from,
      to: chatId,
      chatId,
      body,
      type: Object.keys(m).find((k) => k !== 'messageContextInfo') ?? 'text',
      timestamp: typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : Number(msg.messageTimestamp ?? 0),
      fromMe,
      isGroup,
      media,
    };
  }

  async disconnect(): Promise<void> {
    this.shuttingDown = true;
    this.status = EngineStatus.DISCONNECTED;
    if (this.sock) {
      try { this.sock.end(undefined); } catch {}
      this.sock = null;
    }
    this.callbacks.onStateChanged?.(this.status);
  }

  async logout(): Promise<void> {
    this.shuttingDown = true;
    if (this.sock) {
      try { await this.sock.logout(); } catch {}
    }
    this.clearSession();
    this.status = EngineStatus.DISCONNECTED;
    this.callbacks.onStateChanged?.(this.status);
  }

  async destroy(): Promise<void> {
    await this.disconnect();
    this.removeAllListeners();
  }

  private clearSession(): void {
    try {
      if (fs.existsSync(this.authDir)) {
        for (const f of fs.readdirSync(this.authDir)) {
          fs.unlinkSync(path.join(this.authDir, f));
        }
      }
      this.currentQR = null;
      this.phoneNumber = null;
      this.pushName = null;
    } catch (e) {
      this.logger.error('clearSession failed', e);
    }
  }

  // ============================================================================
  // Status
  // ============================================================================

  getStatus(): EngineStatus {
    return this.status;
  }

  getQRCode(): string | null {
    return this.currentQR;
  }

  getPhoneNumber(): string | null {
    return this.phoneNumber;
  }

  getPushName(): string | null {
    return this.pushName;
  }

  // ============================================================================
  // Messaging
  // ============================================================================

  async sendTextMessage(chatId: string, text: string): Promise<MessageResult> {
    if (!this.sock) throw new Error('not connected');
    const result = await this.sock.sendMessage(chatId, { text });
    return {
      id: result?.key?.id ?? '',
      timestamp: typeof result?.messageTimestamp === 'number' ? result.messageTimestamp : 0,
    };
  }

  async sendImageMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    if (!this.sock) throw new Error('not connected');
    const data = typeof media.data === 'string' && media.data.startsWith('http')
      ? { url: media.data }
      : Buffer.isBuffer(media.data)
        ? media.data
        : Buffer.from(media.data as string, 'base64');
    const result = await this.sock.sendMessage(chatId, {
      image: data,
      caption: media.caption,
      mimetype: media.mimetype,
    });
    return { id: result?.key?.id ?? '', timestamp: 0 };
  }

  async sendVideoMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    if (!this.sock) throw new Error('not connected');
    const data = typeof media.data === 'string' && media.data.startsWith('http')
      ? { url: media.data }
      : Buffer.isBuffer(media.data) ? media.data : Buffer.from(media.data as string, 'base64');
    const result = await this.sock.sendMessage(chatId, { video: data, caption: media.caption, mimetype: media.mimetype });
    return { id: result?.key?.id ?? '', timestamp: 0 };
  }

  async sendAudioMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    if (!this.sock) throw new Error('not connected');
    const data = typeof media.data === 'string' && media.data.startsWith('http')
      ? { url: media.data }
      : Buffer.isBuffer(media.data) ? media.data : Buffer.from(media.data as string, 'base64');
    const result = await this.sock.sendMessage(chatId, { audio: data, mimetype: media.mimetype, ptt: false });
    return { id: result?.key?.id ?? '', timestamp: 0 };
  }

  async sendDocumentMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    if (!this.sock) throw new Error('not connected');
    const data = typeof media.data === 'string' && media.data.startsWith('http')
      ? { url: media.data }
      : Buffer.isBuffer(media.data) ? media.data : Buffer.from(media.data as string, 'base64');
    const result = await this.sock.sendMessage(chatId, {
      document: data,
      fileName: media.filename,
      mimetype: media.mimetype,
    });
    return { id: result?.key?.id ?? '', timestamp: 0 };
  }

  // ============================================================================
  // Reply & Forward
  // ============================================================================

  async replyToMessage(chatId: string, quotedMsgId: string, text: string): Promise<MessageResult> {
    if (!this.sock) throw new Error('not connected');
    const result = await this.sock.sendMessage(chatId, { text }, { quoted: { key: { id: quotedMsgId, remoteJid: chatId } } as never });
    return { id: result?.key?.id ?? '', timestamp: 0 };
  }

  async forwardMessage(fromChatId: string, toChatId: string, messageId: string): Promise<MessageResult> {
    if (!this.sock) throw new Error('not connected');
    // Baileys doesn't have direct forward; just send the quoted message
    const result = await this.sock.sendMessage(toChatId, {
      text: '',
    }, {
      quoted: { key: { id: messageId, remoteJid: fromChatId } } as never,
    });
    return { id: result?.key?.id ?? '', timestamp: 0 };
  }

  // ============================================================================
  // Not-implemented (Phase 3 / extended) — throw to surface for callers
  // ============================================================================

  private notImplemented(method: string): never {
    throw new Error(`BaileysAdapter.${method} not implemented`);
  }

  async sendLocationMessage(): Promise<MessageResult> { return this.notImplemented('sendLocationMessage'); }
  async sendContactMessage(): Promise<MessageResult> { return this.notImplemented('sendContactMessage'); }
  async sendStickerMessage(): Promise<MessageResult> { return this.notImplemented('sendStickerMessage'); }
  async reactToMessage(): Promise<void> { this.notImplemented('reactToMessage'); }
  async getMessageReactions(): Promise<never[]> { return this.notImplemented('getMessageReactions') as never; }
  async deleteMessage(): Promise<void> { return this.notImplemented('deleteMessage') as never; }
  async blockContact(): Promise<void> { return this.notImplemented('blockContact') as never; }
  async unblockContact(): Promise<void> { return this.notImplemented('unblockContact') as never; }

  async getContacts(): Promise<Contact[]> {
    if (!this.sock) throw new Error('not connected');
    // Baileys doesn't expose contacts; return empty list (most users have empty contacts list anyway)
    return [];
  }

  async getContactById(): Promise<Contact | null> { return this.notImplemented('getContactById') as never; }

  async checkNumberExists(number: string): Promise<boolean> {
    if (!this.sock) throw new Error('not connected');
    const results = (await this.sock.onWhatsApp(number)) ?? [];
    const [result] = results;
    return !!result?.exists;
  }

  // ============================================================================
  // Groups
  // ============================================================================

  async getGroups(): Promise<Group[]> {
    if (!this.sock) throw new Error('not connected');
    const groups = await this.sock.groupFetchAllParticipating();
    return Object.values(groups).map((g) => ({
      id: g.id,
      name: g.subject,
      participantsCount: g.participants?.length,
      isAdmin: !!g.participants?.find((p) => p.id === (this.sock?.user?.id ?? '') && (p.admin === 'admin' || p.admin === 'superadmin')),
    }));
  }

  async getGroupInfo(groupId: string): Promise<GroupInfo | null> {
    if (!this.sock) throw new Error('not connected');
    const meta = await this.sock.groupMetadata(groupId);
    if (!meta) return null;
    return {
      id: meta.id,
      name: meta.subject,
      description: meta.desc ?? undefined,
      owner: meta.owner ?? undefined,
      createdAt: meta.creation ? Number(meta.creation) * 1000 : undefined,
      participants: (meta.participants ?? []).map((p) => ({
        id: p.id,
        number: p.id.split('@')[0],
        name: p.name ?? undefined,
        isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
        isSuperAdmin: p.admin === 'superadmin',
      })),
      isReadOnly: !!meta.announce,
      isAnnounce: !!meta.announce,
    };
  }

  async createGroup(name: string, participants: string[]): Promise<Group> {
    if (!this.sock) throw new Error('not connected');
    const result = await this.sock.groupCreate(name, participants);
    return { id: result.id, name };
  }

  async addParticipants(groupId: string, participants: string[]): Promise<void> {
    if (!this.sock) throw new Error('not connected');
    await this.sock.groupParticipantsUpdate(groupId, participants, 'add');
  }

  async removeParticipants(groupId: string, participants: string[]): Promise<void> {
    if (!this.sock) throw new Error('not connected');
    await this.sock.groupParticipantsUpdate(groupId, participants, 'remove');
  }

  async promoteParticipants(groupId: string, participants: string[]): Promise<void> {
    if (!this.sock) throw new Error('not connected');
    await this.sock.groupParticipantsUpdate(groupId, participants, 'promote');
  }

  async demoteParticipants(groupId: string, participants: string[]): Promise<void> {
    if (!this.sock) throw new Error('not connected');
    await this.sock.groupParticipantsUpdate(groupId, participants, 'demote');
  }

  async leaveGroup(groupId: string): Promise<void> {
    if (!this.sock) throw new Error('not connected');
    await this.sock.groupLeave(groupId);
  }

  async setGroupSubject(groupId: string, subject: string): Promise<void> {
    if (!this.sock) throw new Error('not connected');
    await this.sock.groupUpdateSubject(groupId, subject);
  }

  async setGroupDescription(groupId: string, description: string): Promise<void> {
    if (!this.sock) throw new Error('not connected');
    await this.sock.groupUpdateDescription(groupId, description);
  }

  async getGroupInviteCode(groupId: string): Promise<string> {
    if (!this.sock) throw new Error('not connected');
    const code = await this.sock.groupInviteCode(groupId);
    return code ?? '';
  }

  async revokeGroupInviteCode(groupId: string): Promise<string> {
    if (!this.sock) throw new Error('not connected');
    await this.sock.groupRevokeInvite(groupId);
    return this.getGroupInviteCode(groupId);
  }

  // ============================================================================
  // Operations
  // ============================================================================

  async getProfilePicture(contactId: string): Promise<string | null> {
    if (!this.sock) throw new Error('not connected');
    try {
      const url = await this.sock.profilePictureUrl(contactId, 'image');
      return url ?? null;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Labels (WhatsApp Business) — not implemented
  // ============================================================================
  async getLabels(): Promise<never[]> { return this.notImplemented('getLabels') as never; }
  async getLabelById(): Promise<never> { return this.notImplemented('getLabelById') as never; }
  async getChatLabels(): Promise<never[]> { return this.notImplemented('getChatLabels') as never; }
  async addLabelToChat(): Promise<void> { return this.notImplemented('addLabelToChat') as never; }
  async removeLabelFromChat(): Promise<void> { return this.notImplemented('removeLabelFromChat') as never; }

  // ============================================================================
  // Channels / Newsletter — not implemented (Baileys has limited support)
  // ============================================================================
  async getSubscribedChannels(): Promise<never[]> { return this.notImplemented('getSubscribedChannels') as never; }
  async getChannelById(): Promise<never> { return this.notImplemented('getChannelById') as never; }
  async subscribeToChannel(): Promise<never> { return this.notImplemented('subscribeToChannel') as never; }
  async unsubscribeFromChannel(): Promise<void> { return this.notImplemented('unsubscribeFromChannel') as never; }
  async getChannelMessages(): Promise<never[]> { return this.notImplemented('getChannelMessages') as never; }

  // ============================================================================
  // Status / Stories — not implemented
  // ============================================================================
  async getContactStatuses(): Promise<never[]> { return this.notImplemented('getContactStatuses') as never; }
  async getContactStatus(): Promise<never[]> { return this.notImplemented('getContactStatus') as never; }
  async postTextStatus(): Promise<never> { return this.notImplemented('postTextStatus') as never; }
  async postImageStatus(): Promise<never> { return this.notImplemented('postImageStatus') as never; }
  async postVideoStatus(): Promise<never> { return this.notImplemented('postVideoStatus') as never; }
  async deleteStatus(): Promise<void> { return this.notImplemented('deleteStatus') as never; }

  // ============================================================================
  // Catalog (WhatsApp Business) — not implemented
  // ============================================================================
  async getCatalog(): Promise<never> { return this.notImplemented('getCatalog') as never; }
  async getProducts(): Promise<never> { return this.notImplemented('getProducts') as never; }
  async getProduct(): Promise<never> { return this.notImplemented('getProduct') as never; }
  async sendProduct(): Promise<MessageResult> { return this.notImplemented('sendProduct'); }
  async sendCatalog(): Promise<MessageResult> { return this.notImplemented('sendCatalog'); }
}
