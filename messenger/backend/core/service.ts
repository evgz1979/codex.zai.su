import {telegramAuthIssue} from '../auth/telegram-issue.js';
import type { SourceAdapter, SourceEvent } from './source-adapter.js';
import type { Store } from '../storage/store.js';
import { destinationFor, LIMITS, type Conversation, type ConversationPageResult, type Message, type SendRequest, type Snapshot } from '../../shared/types.js';
import { AppError } from './errors.js';
import { ConnectorRegistry } from './registry.js';
import { ConversationSelectionService } from './selection.js';
import { UnifiedInboxService } from './inbox.js';
export { AppError } from './errors.js';
//: Объединяет источники в общую ленту и проверяет отправки.
//: Зависит от SourceAdapter и Store, без Telegram-специфичных ID.
export class MessengerService {
  private state: Snapshot;
  readonly registry: ConnectorRegistry;
  readonly selection: ConversationSelectionService;
  readonly inbox: UnifiedInboxService;
  private pendingRefresh?: Promise<Snapshot>;
  private sends = new Map<string, { signature: string; result: Promise<Message>; created: number }>();
  private latestSeen=new Map<string,string>();
  requestSync?:(id:string)=>void;
  //: Возвращает страницу единой хронологии из выбранных диалогов SQLite.
  //: Общий курсор не даёт доступа к исключённому архиву или произвольному источнику.
  inboxPage(before?:string){if(before&&before.length>2048)throw new AppError(400,'Некорректный курсор кеша.');return {snapshot:this.snapshot(),page:this.store.messagePage('inbox',before)};}
  //: Загружает ограниченный кеш либо пустой снимок.
  //: Загруженные данные сразу помечаются устаревшими.
  constructor(private adapters: SourceAdapter[], private store: Store) {
    this.registry = new ConnectorRegistry(adapters);
    this.selection = new ConversationSelectionService(store);
    this.inbox = new UnifiedInboxService(this.selection);
    this.state = store.loadCache();
    this.state.stale = true;
  }
  //: Возвращает текущий снимок и состояния зарегистрированных источников.
  //: Не обращается к сети; общая лента содержит только десять последних загруженных сообщений.
  snapshot(): Snapshot {
    const state=this.inbox.filter({ ...this.store.loadCache(), stale:this.state.stale,sync:this.store.syncStatus(),sources: this.registry.sources() });
    return {...state,messages:state.messages.slice(-LIMITS.pageMessages)};
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
    if (!this.selection.ids().length) return this.snapshot();
    try {
      const conversations: Conversation[] = [];
      for (const adapter of this.adapters) {
        await adapter.connect();
        conversations.push(...(await adapter.listConversations()).filter(c => this.selection.allows(c.id)));
      }
      conversations.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
      if (revision !== this.selection.revision) return this.snapshot();
      for(const c of conversations)c.preview=this.store.conversation(c.id)?.preview||'';
      this.store.saveCache({conversations,messages:[],sources:this.registry.sources(),refreshedAt:new Date().toISOString(),stale:false});this.state.stale=false;
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
  //: Не заменяет полный архив ограниченным окном браузера.
  cacheMessages(id:string,messages:Message[]){
    const c=this.conversation(id);if(messages.some(m=>m.sourceId!==c.sourceId||m.conversationId!==id))throw new AppError(503,'Некорректная страница источника.');
    this.store.upsertMessages(messages);this.state.stale=false;
  }
  //: Применяет событие источника только к текущему списку разрешений.
  //: Правки и удаления не открывают доступ к исключённому архиву.
  ingest(event:SourceEvent){
    if(event.type==='message'){
      const m=event.message;if(!this.selection.allows(m.conversationId))return;this.adapter(m.sourceId);const c=this.store.conversation(m.conversationId);if(!c||c.sourceId!==m.sourceId)return;
      this.store.upsertMessages([m],!event.edited);this.state.stale=false;
    }else{this.adapter(event.sourceId);const keys=event.keys.filter(key=>key.startsWith(encodeURIComponent(event.sourceId)+':'));this.store.deleteSourceKeys(keys,this.selection.ids());}
  }
  //: Явно отмечает диалог прочитанным через адаптер.
  //: Ориентируется на последнее загруженное сообщение и сохраняет нулевой счётчик.
  async markRead(id: string) {
    const c = this.conversation(id);
    const latest = this.latestSeen.get(id)||this.store.messagePage(id).messages.at(-1)?.id;
    if (latest) {
      await this.adapter(c.sourceId).markRead(id, latest);
      c.unreadCount = 0;
      this.store.saveCache({conversations:[c],messages:[],sources:[],refreshedAt:new Date().toISOString(),stale:false});
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
