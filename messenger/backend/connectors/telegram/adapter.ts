import { Api, utils, type TelegramClient } from 'teleproto';
import type { Dialog } from 'teleproto/tl/custom/dialog';
import type { SourceAdapter } from '../../core/source-adapter.js';
import { SecretVault } from '../../storage/private-files.js';
import { telegramClient } from './client.js';
import { entityId, LIMITS, type Conversation, type Destination, type Message, type Source } from '../../../shared/types.js';

export const TELEGRAM_SOURCE = 'telegram-personal';
const id = (kind: string, native: string) => entityId(TELEGRAM_SOURCE, kind, native);
type TelegramPort = Pick<TelegramClient, 'connected' | 'connect' | 'checkAuthorization' | 'destroy' | 'getDialogs' | 'getMessages' | 'sendMessage' | 'markAsRead'>;
export class TelegramAdapter implements SourceAdapter {
  readonly source: Source = { id: TELEGRAM_SOURCE, kind: 'telegram', name: 'Telegram', connected: false };
  private client?: TelegramPort;
  private dialogs = new Map<string, Dialog>();
  private connecting?: Promise<void>;
  constructor(private vault: SecretVault, private createClient: (credentials: NonNullable<ReturnType<SecretVault['load']>>, vault: SecretVault) => TelegramPort = telegramClient) {}
  async connect() {
    if (this.source.connected && this.client?.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.doConnect().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }
  private async doConnect() {
    this.source.connected = false;
    const credentials = this.vault.load();
    if (!credentials) throw new Error('Telegram login required');
    if (this.client) await this.client.destroy();
    this.client = this.createClient(credentials, this.vault);
    await this.client.connect();
    if (!await this.client.checkAuthorization()) throw new Error('Telegram login required');
    this.source.connected = true;
  }
  async disconnect() {
    this.source.connected = false;
    if (this.client) await this.client.destroy();
  }
  async listConversations(): Promise<Conversation[]> {
    await this.connect();
    const dialogs = await this.client!.getDialogs({ limit: LIMITS.conversations });
    this.dialogs.clear();
    const result: Conversation[] = [];
    for (const d of dialogs) {
      // Только личные диалоги и группы. Broadcast-каналы и communities пропускаем.
      if ((!d.isUser && !d.isGroup) || d.isCommunity || !d.id || !d.entity) continue;
      const native = d.id.toString();
      const conversationId = id('conversation', native);
      const e = d.entity;
      if (e instanceof Api.Chat && (e.deactivated || e.migratedTo)) continue;
      if (e instanceof Api.User && e.deleted) continue;
      this.dialogs.set(conversationId, d);
      const banned = (e instanceof Api.Channel || e instanceof Api.Chat) && (e.left || e.defaultBannedRights?.sendMessages);
      const userBanned = e instanceof Api.Channel && e.bannedRights?.sendMessages;
      const forum = e instanceof Api.Channel && e.forum;
      const paid = e instanceof Api.User && !!e.sendPaidMessagesStars;
      result.push({
        id: conversationId, sourceId: this.source.id, title: d.title || d.name || 'Без названия',
        kind: d.isUser ? 'direct' : 'group', recipient: { id: id('recipient', native), name: d.title || d.name || 'Без названия' },
        unreadCount: d.unreadCount, updatedAt: new Date((d.date || 0) * 1000).toISOString(),
        preview: d.message?.message || (d.message?.media ? 'Вложение' : ''),
        canSend: !banned && !userBanned && !forum && !paid,
      });
    }
    return result;
  }
  private async dialog(conversationId: string) {
    await this.connect();
    if (!this.dialogs.has(conversationId)) await this.listConversations();
    const d = this.dialogs.get(conversationId);
    if (!d) throw new Error('Unknown conversation');
    return d;
  }
  private mapMessage(m: Api.Message, conversationId: string): Message {
    const sender = m.sender;
    const nativeSender = m.senderId?.toString() || 'unknown';
    return {
      id: id('message', `${conversationId}/${m.id}`), sourceId: this.source.id, conversationId,
      sender: { id: id('sender', nativeSender), name: m.out ? 'Вы' : sender ? utils.getDisplayName(sender) || 'Участник' : 'Участник', isSelf: !!m.out },
      date: new Date(m.date * 1000).toISOString(), text: m.message || '', outgoing: !!m.out,
      status: m.out ? 'sent' : 'received',
      attachments: m.media && !(m.media instanceof Api.MessageMediaWebPage) ? [{ id: id('attachment', `${conversationId}/${m.id}`), kind: 'unsupported', name: 'Вложение · откройте в Telegram' }] : [],
    };
  }
  async recentMessages(conversationId: string, limit: number) {
    const d = await this.dialog(conversationId);
    const messages = await this.client!.getMessages(d.inputEntity, { limit: Math.min(limit, LIMITS.selectedMessages) });
    return messages.filter((m): m is Api.Message => m instanceof Api.Message).map(m => this.mapMessage(m, conversationId)).reverse();
  }
  async sendText(destination: Destination, text: string) {
    const d = await this.dialog(destination.conversationId);
    if (destination.sourceId !== this.source.id || destination.recipientId !== id('recipient', d.id!.toString())) throw new Error('Invalid destination');
    const message = await this.client!.sendMessage(d.inputEntity, { message: text, parseMode: undefined, formattingEntities: [], linkPreview: false });
    return this.mapMessage(message, destination.conversationId);
  }
  async markRead(conversationId: string, messageId: string) {
    const d = await this.dialog(conversationId);
    const native = Number(decodeURIComponent(messageId.split(':').at(-1)!).split('/').at(-1));
    if (!Number.isSafeInteger(native)) throw new Error('Invalid message');
    await this.client!.markAsRead(d.inputEntity, native);
  }
}
