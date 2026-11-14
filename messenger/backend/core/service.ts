import {telegramAuthIssue} from '../auth/telegram-issue.js';
import type { SourceAdapter, SourceEvent } from './source-adapter.js';
import type { Store } from '../storage/store.js';
import { destinationFor,comparePosition,compareConversations, LIMITS, MEDIA_LIMITS,OFFLINE_LIMITS,type OfflineBatch, type AttachmentRequest,type Conversation, type ConversationPageResult, type Message, type SendRequest, type Snapshot } from '../../shared/types.js';
import { AppError } from './errors.js';
import { ConnectorRegistry } from './registry.js';
import { ConversationSelectionService } from './selection.js';
import { UnifiedInboxService } from './inbox.js';
import {VoiceTranscriptionService} from './transcription.js';
export { AppError } from './errors.js';
//: Объединяет источники в общую ленту и проверяет отправки.
//: Зависит от SourceAdapter и Store, без Telegram-специфичных ID.
export class MessengerService {
  private state: Snapshot;
  readonly registry: ConnectorRegistry;
  readonly selection: ConversationSelectionService;
  readonly inbox: UnifiedInboxService;
  readonly transcriptions:VoiceTranscriptionService;
  private pendingRefresh?: Promise<Snapshot>;
  private sends = new Map<string, { signature: string; result: Promise<Message>; created: number }>();
  private avatars=new Map<string,{version:string;bytes:Buffer;mimeType:string}>();
  private latestSeen=new Map<string,string>();
  private incoming=new Set<(message:Message)=>void>();
  private readRevision=0;
  requestSync?:(id:string)=>void;
  //: Регистрирует получателя новых входящих после записи в кеш.
  //: Обработчик не получает историю, правки или повтор уже сохранённого ID.
  onIncoming(listener:(message:Message)=>void){this.incoming.add(listener);return ()=>{this.incoming.delete(listener);};}
  //: Проверяет готовность источника к обнаружению новых личных входящих.
  //: Отсутствие Telegram-сессии не запускает авторизацию или сетевой обход.
  canDiscoverContacts(){return this.registry.adapters.some(adapter=>adapter.canDiscoverContacts?.());}
  //: Принимает новые метаданные только от зарегистрированного источника.
  //: История становится доступна после атомарного разрешения нового личного контакта.
  discoverContact(conversation:Conversation){this.adapter(conversation.sourceId);return this.selection.admit(conversation);}
  //: Изолирует уведомления от ошибок необязательных подписчиков.
  //: Сообщение уже сохранено; ошибка доставки не отменяет синхронизацию.
  private publishIncoming(message:Message){for(const listener of this.incoming){try{listener(message);}catch{/* Независимая доставка. */}}}
  //: Возвращает страницу единой хронологии из выбранных диалогов SQLite.
  //: Общий курсор не даёт доступа к исключённому архиву или произвольному источнику.
  inboxPage(before?:string){if(before&&before.length>2048)throw new AppError(400,'Некорректный курсор кеша.');return {snapshot:this.snapshot(),page:this.store.messagePage('inbox',before)};}
  //: Читает небольшие головы выбранных чатов для фоновой подготовки устройства.
  //: Проверяет весь пакет до чтения SQLite, не вызывает источник и не меняет latestSeen/read.
  offlineBatch(ids:unknown):OfflineBatch{
    if(!Array.isArray(ids)||!ids.length||ids.length>OFFLINE_LIMITS.batch||ids.some(id=>typeof id!=='string'||!id||id.length>2048)||new Set(ids).size!==ids.length)throw new AppError(400,'Некорректный список чатов для сохранения.');
    const conversations=(ids as string[]).map(id=>this.conversation(id));const messages:Message[]=[];const readyIds:string[]=[];
    for(const conversation of conversations){const page=this.store.messagePage(conversation.id);messages.push(...page.messages.slice(-OFFLINE_LIMITS.headMessages));if(page.messages.length||page.historyComplete)readyIds.push(conversation.id);}
    return {messages,readyIds};
  }
  //: Загружает ограниченный кеш либо пустой снимок.
  //: Загруженные данные сразу помечаются устаревшими.
  constructor(private adapters: SourceAdapter[], private store: Store) {
    this.registry = new ConnectorRegistry(adapters);
    this.selection = new ConversationSelectionService(store);
    this.inbox = new UnifiedInboxService(this.selection);
    this.transcriptions=new VoiceTranscriptionService(this,store);
    this.state = store.loadCache();
    this.state.stale = true;
  }
  //: Возвращает текущий снимок и состояния зарегистрированных источников.
  //: Не обращается к сети; общая лента содержит только десять последних загруженных сообщений.
  snapshot(): Snapshot {
    const state=this.inbox.filter({ ...this.store.loadCache(), stale:this.state.stale,sync:this.store.syncStatus(),sources: this.registry.sources() });
    const pins = this.store.conversationPins();
    const conversations = state.conversations.map(c => ({...c, pinOrder:pins.get(c.id)})).sort(compareConversations);
    return {...state,conversations,messages:state.messages.slice(-LIMITS.pageMessages)};
  }
  //: Ищет зарегистрированный источник по sourceId.
  //: Неизвестный источник отклоняется с 409.
  private adapter(id: string) {
    return this.registry.get(id);
  }
  //: Ищет диалог только среди известных серверу DTO.
  //: Отсутствующий conversationId отклоняется с 404.
  private conversation(id: string): Conversation {
    this.selection.require(id);
    const c = this.store.conversation(id);
    if (!c) throw new AppError(404, 'Диалог не найден.');
    return c;
  }
  //: Меняет закрепление выбранного чата в текущем аккаунте Messenger.
  //: Проверяет входные данные и выбор; обновление выполняется только в SQLite.
  setConversationPin(id: unknown, pinned: unknown): Snapshot {
    if (typeof id !== 'string' || !id || id.length > 2048 || typeof pinned !== 'boolean') {
      throw new AppError(400, 'Некорректный запрос закрепления.');
    }
    this.conversation(id);
    this.store.setConversationPin(id, pinned);
    return this.snapshot();
  }
  //: Обновляет метаданные разрешённых диалогов для фоновой сверки.
  //: Повторный параллельный вызов использует тот же pendingRefresh.
  refresh(): Promise<Snapshot> {
    if (this.pendingRefresh) return this.pendingRefresh;
    this.pendingRefresh = this.doRefresh().finally(() => { this.pendingRefresh = undefined; });
    return this.pendingRefresh;
  }
  //: Обновляет каталог и непрочитанные без обхода истории чатов.
  //: Полный сохранённый архив остаётся на диске, без повторного чтения для снимка.
  private async doRefresh(): Promise<Snapshot> {
    const revision = this.selection.revision;
    const readRevision=this.readRevision;
    const cacheRevision=this.store.revision;
    if (!this.selection.ids().length&&!this.canDiscoverContacts()) return this.snapshot();
    try {
      const conversations: Conversation[] = [];
      const catalogs:{sourceId:string;conversations:Conversation[]}[]=[];
      let failed=false;let connected=0;let failure:unknown;
      for (const adapter of this.adapters) {
        try{
          const pause=Number(this.store.get(`sync.sourcePause.${adapter.source.id}`)||0);if(pause>Date.now())throw new AppError(503,'Источник временно недоступен.',Math.ceil((pause-Date.now())/1000));
          await adapter.connect();
          catalogs.push({sourceId:adapter.source.id,conversations:await adapter.listConversations(id=>this.selection.allows(id))});
          if(adapter.source.connected)connected++;else if(adapter.canDiscoverContacts?.())failed=true;
        }catch(error){
          failure??=error;const seconds=(error instanceof AppError?error.retryAfterSeconds:undefined)||telegramAuthIssue(error).retryAfterSeconds;if(this.adapters.length>1&&seconds)this.store.set(`sync.sourcePause.${adapter.source.id}`,String(Date.now()+seconds*1000));
          failed=true;adapter.source.connected=false;
          catalogs.push({sourceId:adapter.source.id,conversations:this.store.loadCache().conversations.filter(c=>c.sourceId===adapter.source.id)});
        }
      }
      if(failed&&!connected)throw failure||new Error('Sources unavailable');
      if (revision !== this.selection.revision) return this.snapshot();
      for(const catalog of catalogs){const adapter=this.registry.get(catalog.sourceId);if(adapter.source.connected&&adapter.canDiscoverContacts?.())this.selection.observe(catalog.sourceId,catalog.conversations);conversations.push(...catalog.conversations.filter(c=>this.selection.allows(c.id)));}
      for(const c of conversations){
        const current=this.store.conversation(c.id);if(!current)continue;
        if(c.avatarVersion&&c.avatarVersion===current.avatarVersion&&!c.avatarThumbnail)c.avatarThumbnail=current.avatarThumbnail;
        const newer=comparePosition({date:current.updatedAt,id:current.previewMessageId||''},{date:c.updatedAt,id:c.previewMessageId||''})>0&&(!c.previewMessageId||this.store.revision!==cacheRevision);
        if(!c.previewMessageId||newer){c.preview=current.preview;c.previewMessageId=current.previewMessageId;}
        if(newer||readRevision!==this.readRevision)c.unreadCount=current.unreadCount;
        if(newer)c.updatedAt=current.updatedAt;
      }
      this.store.saveCache({conversations,messages:[],sources:this.registry.sources(),refreshedAt:new Date().toISOString(),stale:failed});this.state.stale=failed;
      return this.snapshot();
    } catch (error) {
      this.state.stale = true;
      throw new AppError(503, 'Не удалось обновить метаданные. Фоновая синхронизация повторит попытку.',telegramAuthIssue(error).retryAfterSeconds);
    }
  }
  //: Читает страницу только из SQLite и будит фон при незавершённой истории.
  //: Открытие и прокрутка не вызывают MTProto; доступ проверяется до чтения.
  async open(id:string,before?:string):Promise<ConversationPageResult>{
    this.conversation(id);if(before!==undefined&&(!before||before.length>2048))throw new AppError(400,'Некорректный курсор кеша.');
    const page=this.store.messagePage(id,before);if(!page.historyComplete&&(!page.messages.length||before))this.requestSync?.(id);
    if(!before&&page.messages.length)this.latestSeen.set(id,page.messages.at(-1)!.id);
    return {page,snapshot:this.snapshot()};
  }
  //: Записывает разрешённые сообщения фоновой страницы с проверкой источника.
  //: Флаг notify относится только к сверке свежей головы, история молчит.
  cacheMessages(id:string,messages:Message[],notify=false){
    const c=this.conversation(id);if(messages.some(m=>m.sourceId!==c.sourceId||m.conversationId!==id))throw new AppError(503,'Некорректная страница источника.');
    const discovered=this.store.get(`discovery.notify.${id}`);
    const incoming=notify||discovered?messages.filter(message=>!message.outgoing&&!message.editedAt&&!this.store.message(message.id)&&(!discovered||message.date>=discovered)):[];
    this.store.upsertMessages(messages);this.state.stale=false;
    for(const message of incoming)if(this.store.message(message.id))this.publishIncoming(message);
    if(discovered)this.store.remove(`discovery.notify.${id}`);
  }
  //: Применяет событие источника только к текущему списку разрешений.
  //: Правки и удаления не открывают доступ к исключённому архиву.
  ingest(event:SourceEvent){
    if(event.type==='transcription'){this.transcriptions.ingest(event);return;}
    if(event.type==='message'){
      const m=event.message;if(!this.selection.allows(m.conversationId))return;this.adapter(m.sourceId);const c=this.store.conversation(m.conversationId);if(!c||c.sourceId!==m.sourceId)return;
      const fresh=!event.edited&&!m.editedAt&&!m.outgoing&&!this.store.message(m.id);
      this.store.upsertMessages([m],!event.edited);this.state.stale=false;
      if(fresh&&this.store.message(m.id))this.publishIncoming(m);
    }else{this.adapter(event.sourceId);const keys=event.keys.filter(key=>key.startsWith(encodeURIComponent(event.sourceId)+':'));this.store.deleteSourceKeys(keys,this.selection.ids());}
  }
  //: Загружает ограниченное фото разрешённого диалога с приватным кешем в памяти.
  //: Проверяет выбор и версию после каждого чанка; кеш ограничен 64 фото по 512 КиБ.
  async avatar(id:string,signal:AbortSignal,refresh=false){
    if(typeof id!=='string'||!id||id.length>2048)throw new AppError(400,'Выберите диалог.');
    const c=this.conversation(id);const version=c.avatarVersion;const adapter=this.adapter(c.sourceId);
    if(!version||!adapter.openAvatar)throw new AppError(404,'Фото отсутствует.');
    //: Повторно сверяет выбранность и версию фото во время загрузки.
    //: Отменённый или исключённый запрос не возвращает даже готовый кеш.
    const check=()=>{signal.throwIfAborted();if(this.conversation(id).avatarVersion!==version)throw new AppError(409,'Фото изменилось.');};
    check();if(refresh)this.avatars.delete(id);const cached=this.avatars.get(id);if(cached?.version===version){this.avatars.delete(id);this.avatars.set(id,cached);return cached;}
    const parts:Buffer[]=[];let size=0;
    for await(const chunk of await adapter.openAvatar(id,signal)){check();size+=chunk.byteLength;if(size>MEDIA_LIMITS.previewBytes)throw new AppError(413,'Фото слишком большое.');parts.push(Buffer.from(chunk));}
    check();const bytes=Buffer.concat(parts);const mimeType=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':undefined;
    if(!mimeType)throw new AppError(415,'Формат фото недоступен.');
    if(mimeType==='image/jpeg'&&(bytes.at(-2)!==255||bytes.at(-1)!==217))throw new AppError(503,'Фото загружено не полностью.');
    const result={version,bytes,mimeType};this.avatars.delete(id);this.avatars.set(id,result);while(this.avatars.size>64)this.avatars.delete(this.avatars.keys().next().value!);return result;
  }
  //: Проверяет точный маршрут сохранённого вложения перед каждым чтением.
  //: Чужой message ID, исключённый диалог и удалённая запись не открывают источник.
  attachmentMessage(input:AttachmentRequest){
    if(!input||(input.variant!==undefined&&input.variant!=='preview')||[input.conversationId,input.messageId,input.attachmentId].some(id=>typeof id!=='string'||!id||id.length>2048))throw new AppError(400,'Некорректный маршрут вложения.');
    const c=this.conversation(input.conversationId);const message=this.store.message(input.messageId);
    if(!message||message.conversationId!==c.id||message.sourceId!==c.sourceId||!message.attachments.some(a=>a.id===input.attachmentId))throw new AppError(404,'Вложение не найдено.');
    return message;
  }
  //: Открывает поток через адаптер источника только после проверки сохранённого выбора.
  //: Старые placeholder-вложения получают актуальные метаданные без обхода истории.
  async attachmentContent(input:AttachmentRequest,signal:AbortSignal){
    const message=this.attachmentMessage(input);const adapter=this.adapter(message.sourceId);if(!adapter.openAttachment)throw new AppError(415,'Источник не поддерживает вложения.');
    const result=await adapter.openAttachment(input,signal);this.attachmentMessage(input);if(result.attachment.id!==input.attachmentId)throw new AppError(503,'Не удалось получить вложение.');return result;
  }
  //: Обновляет безопасные метаданные только неизменённого сообщения после загрузки.
  //: Поздний результат не отменяет правку, удаление или снятие разрешения.
  attachmentMetadata(input:AttachmentRequest,original:Message,attachment:Message['attachments'][number]){
    const current=this.attachmentMessage(input);if(current.editedAt!==original.editedAt)throw new AppError(409,'Сообщение изменилось. Откройте вложение заново.');
    if(input.variant==='preview')return;
    this.store.upsertMessages([{...current,attachments:current.attachments.map(a=>a.id===attachment.id?attachment:a)}]);
  }
  //: Отмечает прочитанным до реально показанного либо явно выбранного сообщения.
  //: Проверяет маршрут, сохраняет новые входящие и не откатывает позднюю границу.
  async markRead(id: string,messageId?:string) {
    const c = this.conversation(id);
    const latest = messageId??this.latestSeen.get(id)??this.store.messagePage(id).messages.at(-1)?.id;
    if (latest) {
      const message=this.store.message(latest);if(!message||message.conversationId!==id||message.sourceId!==c.sourceId)throw new AppError(400,'Сообщение не относится к этому диалогу.');
      const previous=this.store.readPosition(id);if(previous&&comparePosition(previous,message)>=0)return this.snapshot();
      await this.adapter(c.sourceId).markRead(id, latest);
      this.selection.require(id);this.store.acknowledgeRead(id,message);this.readRevision++;
    }
    return this.snapshot();
  }
  //: Проверяет текст, точный маршрут и повтор request ID перед отправкой.
  //: Неизвестный результат не повторяется автоматически; Promise хранится до 15 минут процесса.
  send(input: SendRequest): Promise<Message> {
    if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.length > LIMITS.text || !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId ?? '')) throw new AppError(400, 'Проверьте текст сообщения.');
    const d = input.destination;
    if (!d || typeof d.conversationId !== 'string') throw new AppError(400, 'Выберите адресата.');
    const c = this.conversation(d.conversationId);
    const expected = destinationFor(c);
    if (!c.canSend || d.sourceId !== expected.sourceId || d.recipientId !== expected.recipientId) throw new AppError(409, 'Адресат изменился. Выберите диалог заново.');
    const signature = JSON.stringify([expected, input.text]);
    for (const [key, send] of this.sends) if (Date.now() - send.created > 900000) this.sends.delete(key);
    const previous = this.sends.get(input.requestId);
    if (previous) {
      if (previous.signature !== signature) throw new AppError(409, 'Идентификатор отправки уже использован.');
      return previous.result;
    }
    const result = Promise.resolve().then(async () => {
      this.selection.require(c.id);
      const message = await this.adapter(c.sourceId).sendText(expected, input.text);
      this.selection.require(c.id);
      this.store.upsertMessages([message]);
      this.latestSeen.set(c.id,message.id);
      c.preview = message.text; c.updatedAt = message.date;
      this.state.stale=false;
      return message;
    }).catch(() => { throw new AppError(502, 'Результат отправки неизвестен. Дождитесь автоматической синхронизации и сверьте переписку перед повтором.'); });
    this.sends.set(input.requestId, { signature, result, created: Date.now() });
    return result;
  }
  //: Закрывает соединения всех зарегистрированных источников.
  //: Ожидает allSettled, чтобы ошибка одного адаптера не пропустила остальные.
  async disconnect() { await this.registry.disconnect(); }
  //: Перечитывает кеш только разрешённых диалогов.
  //: Не загружает данные Telegram и не удаляет архив исключённых диалогов.
  reset() { this.latestSeen.clear();this.state = this.store.loadCache(); this.state.stale = true; }
}
