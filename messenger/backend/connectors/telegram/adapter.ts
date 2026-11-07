import { Api, utils, type TelegramClient } from 'teleproto';
import type { Dialog } from 'teleproto/tl/custom/dialog';
import type { SourceAdapter } from '../../core/source-adapter.js';
import { SecretVault } from '../../storage/private-files.js';
import { telegramClient } from './client.js';
import { entityId, LIMITS, type Conversation, type ConversationCatalog, type Destination, type Message, type MessagePage, type Source } from '../../../shared/types.js';
import {telegramFolders,type TelegramMuteDefaults} from './folders.js';
import {AppError} from '../../core/errors.js';
import {NewMessage,EditedMessage,DeletedMessage,type NewMessageEvent,type DeletedMessageEvent} from 'teleproto/events';
import {telegramAttachments,telegramPreview} from './media.js';
import {type AttachmentRequest,MEDIA_LIMITS} from '../../../shared/types.js';
import type {AttachmentContent} from '../../core/source-adapter.js';
import type {SourceEvent} from '../../core/source-adapter.js';
import type {HistoryPage} from '../../../shared/types.js';

//: Задаёт стабильный ID личного Telegram-источника.
//: Это ID экземпляра адаптера, а не общий вид провайдера.
export const TELEGRAM_SOURCE = 'telegram-personal';
//: Ограничивает поверхность teleproto, нужную адаптеру.
//: Тесты подставляют этот порт без реального Telegram-подключения.
type TelegramPort = Pick<TelegramClient, 'connected' | 'connect' | 'checkAuthorization' | 'destroy' | 'getDialogs' | 'getMessages' | 'sendMessage' | 'markAsRead' | 'logOut' | 'invoke' | 'getNotifySettings' | 'addEventHandler' | 'iterDownload'>;
//: Реализует SourceAdapter для одного личного Telegram-аккаунта.
//: Сессия и native peer остаются на сервере, DTO не содержат секретов.
export class TelegramAdapter implements SourceAdapter {
  readonly source: Source = { id: TELEGRAM_SOURCE, kind: 'telegram', name: 'Telegram', connected: false };
  private client?: TelegramPort;
  private dialogs = new Map<string, Pick<Dialog, 'id' | 'inputEntity'>>();
  private connecting?: Promise<void>;
  private subscribers=new Set<{listener:(event:SourceEvent)=>void;allows:(id:string)=>boolean}>();
  private listenedClient?:TelegramPort;
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
    this.bindEvents();
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
      ...(m.editDate?{editedAt:new Date(m.editDate*1000).toISOString()}:{}),
      attachments: telegramAttachments(this.source.id,conversationId,m),
      sourceKey:entityId(this.source.id,'source-message',`${m.peerId instanceof Api.PeerChannel?utils.getPeerId(m.peerId):'global'}/${m.id}`),
    };
  }
  //: Читает только первую страницу выбранного диалога.
  //: Совместимый контракт без курсора ограничен десятью сообщениями.
  async recentMessages(conversationId: string, limit: number) {
    return (await this.messagePage(conversationId,limit)).messages;
  }
  //: Проверяет принадлежность курсора текущему источнику и диалогу.
  //: Не принимает native ID другого чата или произвольный offset Telegram.
  private cursorOffset(conversationId:string,cursor:string):number {
    const parts=cursor.split(':');
    let value='';try{value=decodeURIComponent(parts[2]||'');}catch{throw new AppError(400,'Некорректный курсор сообщений.');}
    const prefix=`${conversationId}/`;const native=value.slice(prefix.length);
    if(parts.length!==3||parts[0]!==encodeURIComponent(this.source.id)||parts[1]!=='message'||!value.startsWith(prefix)||!/^\d{1,10}$/.test(native)||Number(native)<=0||Number(native)>2147483647)throw new AppError(400,'Курсор не относится к этому диалогу.');
    return Number(native);
  }
  //: Читает одну страницу до указанного сообщения без обхода других чатов.
  //: Курсор двигается по raw-странице, включая сервисные записи; запрос ограничен 10.
  async messagePage(conversationId:string,limit:number,before?:string):Promise<MessagePage> {
    return this.fetchPage(conversationId,Math.min(limit,LIMITS.pageMessages),before);
  }
  //: Возвращает внутреннюю страницу до 100 записей для полного фонового кеша.
  //: Не вызывается при открытии страницы браузером и не скачивает медиа.
  async historyPage(conversationId:string,before?:string,limit:number=LIMITS.syncMessages):Promise<HistoryPage>{return this.fetchPage(conversationId,Math.max(1,Math.min(limit,LIMITS.syncMessages)),before);}
  //: Читает один ограниченный фрагмент истории для синхронизатора.
  //: Все raw-курсоры сохраняют продвижение даже через сервисные сообщения.
  private async fetchPage(conversationId:string,count:number,before?:string):Promise<HistoryPage>{
    const offsetId=before?this.cursorOffset(conversationId,before):undefined;
    const d = await this.dialog(conversationId);
    const messages = await this.client!.getMessages(d.inputEntity, { limit: count, ...(offsetId?{offsetId}:{}) });
    const oldest=messages.at(-1)?.id;
    return {conversationId,messages:messages.filter((m): m is Api.Message => m instanceof Api.Message).map(m => this.mapMessage(m, conversationId)).reverse(),cursors:messages.map(m=>entityId(this.source.id,'message',`${conversationId}/${m.id}`)),nextCursor:messages.length===count&&oldest&&(!offsetId||oldest<offsetId)?entityId(this.source.id,'message',`${conversationId}/${oldest}`):null};
  }
  //: Получает точное сообщение и создаёт ограниченный поток его медиа.
  //: Peer, message и attachment сверяются; свежие file references остаются на сервере.
  async openAttachment(input:AttachmentRequest,signal:AbortSignal):Promise<AttachmentContent>{
    const native=this.cursorOffset(input.conversationId,input.messageId);const dialog=await this.dialog(input.conversationId);signal.throwIfAborted();
    const messages=await this.client!.getMessages(dialog.inputEntity,{ids:[native]});signal.throwIfAborted();
    const message=messages[0];if(!(message instanceof Api.Message)||message.id!==native||entityId(this.source.id,'conversation',message.chatId?.toString()||utils.getPeerId(message.peerId))!==input.conversationId)throw new AppError(404,'Вложение больше недоступно.');
    const attachment=telegramAttachments(this.source.id,input.conversationId,message).find(a=>a.id===input.attachmentId);
    if(!attachment||attachment.downloadable===false)throw new AppError(415,'Это вложение доступно только в Telegram.');
    if(input.variant==='preview'){
      const preview=message.media&&telegramPreview(message.media);if(!preview&&attachment.kind==='image'&&attachment.size!==undefined&&attachment.size<=MEDIA_LIMITS.previewBytes)return {attachment,chunks:this.client!.iterDownload(message,{signal,limit:MEDIA_LIMITS.previewBytes+1,requestSize:64*1024})};if(!preview)throw new AppError(415,'Для этого вложения нет миниатюры.');
      return {attachment:{id:attachment.id,kind:'image',name:attachment.name,mimeType:'image/jpeg',size:preview.size,downloadable:true},chunks:preview.bytes?(async function*(){yield preview.bytes!;})():this.client!.iterDownload(preview.location!,{signal,dcId:preview.dcId,limit:MEDIA_LIMITS.previewBytes+1,requestSize:64*1024})};
    }
    return {attachment,chunks:this.client!.iterDownload(message,{signal,limit:MEDIA_LIMITS.fileBytes+1,requestSize:256*1024})};
  }
  //: Подписывает ядро на изменения только разрешённых диалогов.
  //: Подписка сохраняется при пересоздании MTProto-клиента; unselected-текст не копируется.
  subscribe(listener:(event:SourceEvent)=>void,allows:(id:string)=>boolean){const item={listener,allows};this.subscribers.add(item);this.bindEvents();return()=>{this.subscribers.delete(item);};}
  //: Подключает по одному обработчику событий нового клиента.
  //: Не журналирует updates; личные удаления имеют глобальную область, каналы — собственную.
  private bindEvents(){
    const client=this.client;if(!client?.addEventHandler||this.listenedClient===client)return;this.listenedClient=client;
    //: Преобразует входящее сообщение только после проверки разрешённого диалога.
    //: Правка не увеличивает счётчик непрочитанных как новое сообщение.
    const changed=(event:NewMessageEvent)=>{const m=event.message;if(!(m instanceof Api.Message))return;const native=m.chatId?.toString()||utils.getPeerId(m.peerId);const id=entityId(this.source.id,'conversation',native);for(const sub of this.subscribers)if(sub.allows(id))sub.listener({type:'message',message:this.mapMessage(m,id),edited:!!m.editDate});};
    //: Передаёт области удалённых ID без содержимого сообщения.
    //: Неоднозначные личные удаления разрешаются серверным индексом source_key.
    const deleted=(event:DeletedMessageEvent)=>{const namespace=event.isChannel?event.chatId?.toString():'global';if(!namespace)return;const id=entityId(this.source.id,'conversation',namespace);const keys=event.deletedIds.map(n=>entityId(this.source.id,'source-message',`${namespace}/${n}`));for(const sub of this.subscribers)if(!event.isChannel||sub.allows(id))sub.listener({type:'delete',sourceId:this.source.id,keys});};
    client.addEventHandler(changed,new NewMessage({}));client.addEventHandler(changed,new EditedMessage({}));client.addEventHandler(deleted,new DeletedMessage({}));
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
