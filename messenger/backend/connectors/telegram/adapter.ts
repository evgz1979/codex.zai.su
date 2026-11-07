import { Api, utils, type TelegramClient } from 'teleproto';
import type { Dialog } from 'teleproto/tl/custom/dialog';
import type { SourceAdapter } from '../../core/source-adapter.js';
import { SecretVault } from '../../storage/private-files.js';
import { telegramClient } from './client.js';
import { entityId, LIMITS, type Conversation, type ConversationCatalog, type Destination, type Message, type Source } from '../../../shared/types.js';
import {telegramFolders,type TelegramMuteDefaults} from './folders.js';

//: Задаёт стабильный ID личного Telegram-источника.
//: Это ID экземпляра адаптера, а не общий вид провайдера.
export const TELEGRAM_SOURCE = 'telegram-personal';
//: Ограничивает поверхность teleproto, нужную адаптеру.
//: Тесты подставляют этот порт без реального Telegram-подключения.
type TelegramPort = Pick<TelegramClient, 'connected' | 'connect' | 'checkAuthorization' | 'destroy' | 'getDialogs' | 'getMessages' | 'sendMessage' | 'markAsRead' | 'logOut' | 'invoke' | 'getNotifySettings'>;
//: Реализует SourceAdapter для одного личного Telegram-аккаунта.
//: Сессия и native peer остаются на сервере, DTO не содержат секретов.
export class TelegramAdapter implements SourceAdapter {
  readonly source: Source = { id: TELEGRAM_SOURCE, kind: 'telegram', name: 'Telegram', connected: false };
  private client?: TelegramPort;
  private dialogs = new Map<string, Pick<Dialog, 'id' | 'inputEntity'>>();
  private connecting?: Promise<void>;
  //: Подключает приватное хранилище и фабрику клиента.
  //: По умолчанию используется teleproto; отдельная фабрика служит изолированным тестам.
  constructor(private vault: SecretVault, private createClient: (credentials: NonNullable<ReturnType<SecretVault['load']>>, vault: SecretVault) => TelegramPort = telegramClient) {
    const credentials = vault.load();
    if (credentials?.accountId) this.source.id = `telegram-${credentials.accountId}`;
  }
  //: Устанавливает готовое авторизованное соединение.
  //: Параллельные вызовы используют один Promise подключения.
  async connect() {
    if (this.source.connected && this.client?.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.doConnect().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }
  //: Создаёт клиент из сохранённых credentials и проверяет авторизацию.
  //: Не запускает интерактивный вход и помечает connected только после проверки.
  private async doConnect() {
    this.source.connected = false;
    const credentials = this.vault.load();
    if (!credentials) throw new Error('Telegram login required');
    if (this.client) await this.client.destroy();
    this.source.id = credentials.accountId ? `telegram-${credentials.accountId}` : TELEGRAM_SOURCE;
    this.client = this.createClient(credentials, this.vault);
    await this.client.connect();
    if (!await this.client.checkAuthorization()) throw new Error('Telegram login required');
    this.source.connected = true;
  }
  //: Закрывает клиент и сбрасывает connected.
  //: Удалённая Telegram-авторизация остаётся действующей.
  async revoke() {
    try { if (this.vault.exists()) { await this.connect(); await this.client!.logOut(); } } catch { /* Локальный доступ отзывается даже при недоступности Telegram. */ } finally { await this.disconnect(); this.vault.clear(); this.dialogs.clear(); }
  }
  //: Закрывает соединение MTProto без удаления авторизации.
  //: При обычной остановке приложения сохранённая сессия остаётся.
  async disconnect() {
    this.source.connected = false;
    if (this.client) await this.client.destroy();
  }
  //: Получает ограниченный список диалогов для общей ленты.
  //: Папки не запрашиваются; история остаётся отдельной операцией.
  async listConversations(): Promise<Conversation[]> {
    return (await this.loadCatalog(false)).conversations;
  }
  //: Получает административный каталог с существующими папками Telegram.
  //: Не меняет папки, выбор диалогов или сохранённую авторизацию.
  async listConversationCatalog():Promise<ConversationCatalog> {
    return this.loadCatalog(true);
  }
  //: Читает метаданные и при необходимости правила папок одним каталогом.
  //: В памяти адаптера остаются только ID и peer, без содержимого сообщений.
  private async loadCatalog(withFolders:boolean):Promise<ConversationCatalog> {
    await this.connect();
    const dialogs = await this.client!.getDialogs({ limit: LIMITS.conversations });
    this.dialogs.clear();
    const result: Conversation[] = [];
    for (const d of dialogs) {
      // Метаданные каналов доступны для административного выбора.
      if ((!d.isUser && !d.isGroup && !d.isChannel) || d.isCommunity || !d.id || !d.entity) continue;
      const native = d.id.toString();
      const conversationId = entityId(this.source.id, 'conversation', native);
      const e = d.entity;
      if (e instanceof Api.Chat && (e.deactivated || e.migratedTo)) continue;
      if (e instanceof Api.User && e.deleted) continue;
      this.dialogs.set(conversationId, { id:d.id, inputEntity:d.inputEntity });
      const banned = (e instanceof Api.Channel || e instanceof Api.Chat) && (e.left || (!(e.creator || e.adminRights) && e.defaultBannedRights?.sendMessages));
      const userBanned = e instanceof Api.Channel && e.bannedRights?.sendMessages;
      const broadcast = e instanceof Api.Channel && e.broadcast && !(e.creator || e.adminRights?.postMessages);
      const forum = e instanceof Api.Channel && e.forum;
      const paid = e instanceof Api.User && BigInt(e.sendPaidMessagesStars?.toString() || '0') > 0n;
      result.push({
        id: conversationId, sourceId: this.source.id, title: d.title || d.name || 'Без названия',
        kind: d.isUser ? 'direct' : d.isGroup ? 'group' : 'channel', recipient: { id: entityId(this.source.id, 'recipient', native), name: d.title || d.name || 'Без названия' },
        unreadCount: d.unreadCount, updatedAt: new Date((d.date || 0) * 1000).toISOString(),
        preview: '',
        canSend: !banned && !userBanned && !forum && !paid && !broadcast,
      });
    }
    let folders:ConversationCatalog['folders']=[];
    if(withFolders){
      const {filters}=await this.client!.invoke(new Api.messages.GetDialogFilters());
      const defaults:TelegramMuteDefaults={users:0,groups:0,channels:0};
      if(filters.some(f=>f instanceof Api.DialogFilter&&f.excludeMuted)){
        const categories=[['users',new Api.InputNotifyUsers()],['groups',new Api.InputNotifyChats()],['channels',new Api.InputNotifyBroadcasts()]] as const;
        await Promise.all(categories.map(async([kind,peer])=>{const settings=await this.client!.getNotifySettings(peer);defaults[kind]=settings.muteUntil??0;}));
      }
      folders=telegramFolders(this.source.id,filters,dialogs,new Set(result.map(c=>c.id)),defaults);
    }
    return {conversations:result,folders,truncated:(dialogs.total??0)>dialogs.length||dialogs.length>=LIMITS.conversations};
  }
  //: Находит native dialog по общему conversationId.
  //: При отсутствии в памяти заново получает ограниченный список диалогов.
  private async dialog(conversationId: string) {
    await this.connect();
    if (!this.dialogs.has(conversationId)) await this.listConversations();
    const d = this.dialogs.get(conversationId);
    if (!d) throw new Error('Unknown conversation');
    return d;
  }
  //: Преобразует Telegram Message в провайдер-независимый DTO.
  //: ID включает диалог; вложения обозначаются без скачивания, статус не выдаётся за delivered.
  private mapMessage(m: Api.Message, conversationId: string): Message {
    const sender = m.sender;
    const nativeSender = m.senderId?.toString() || 'unknown';
    return {
      id: entityId(this.source.id, 'message', `${conversationId}/${m.id}`), sourceId: this.source.id, conversationId,
      sender: { id: entityId(this.source.id, 'sender', nativeSender), name: m.out ? 'Вы' : sender ? utils.getDisplayName(sender) || 'Участник' : 'Участник', isSelf: !!m.out },
      date: new Date(m.date * 1000).toISOString(), text: m.message || '', outgoing: !!m.out,
      status: m.out ? 'sent' : 'received',
      attachments: m.media && !(m.media instanceof Api.MessageMediaWebPage) ? [{ id: entityId(this.source.id, 'attachment', `${conversationId}/${m.id}`), kind: 'unsupported', name: 'Вложение · откройте в Telegram' }] : [],
    };
  }
  //: Читает последние сообщения выбранного диалога.
  //: Ограничивает запрос selectedMessages и возвращает только обычные Api.Message.
  async recentMessages(conversationId: string, limit: number) {
    const d = await this.dialog(conversationId);
    const messages = await this.client!.getMessages(d.inputEntity, { limit: Math.min(limit, LIMITS.selectedMessages) });
    return messages.filter((m): m is Api.Message => m instanceof Api.Message).map(m => this.mapMessage(m, conversationId)).reverse();
  }
  //: Отправляет буквальный текст в проверенный Telegram dialog.
  //: Повторно сверяет source и recipient; отключает разметку и link preview.
  async sendText(destination: Destination, text: string) {
    const d = await this.dialog(destination.conversationId);
    if (destination.sourceId !== this.source.id || destination.recipientId !== entityId(this.source.id, 'recipient', d.id!.toString())) throw new Error('Invalid destination');
    const message = await this.client!.sendMessage(d.inputEntity, { message: text, parseMode: undefined, formattingEntities: [], linkPreview: false });
    return this.mapMessage(message, destination.conversationId);
  }
  //: Отмечает прочитанным до указанного native message ID.
  //: Получает peer только через известный общий conversationId.
  async markRead(conversationId: string, messageId: string) {
    const d = await this.dialog(conversationId);
    const native = Number(decodeURIComponent(messageId.split(':').at(-1)!).split('/').at(-1));
    if (!Number.isSafeInteger(native)) throw new Error('Invalid message');
    await this.client!.markAsRead(d.inputEntity, native);
  }
}
