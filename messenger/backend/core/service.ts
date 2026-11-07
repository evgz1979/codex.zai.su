import type { SourceAdapter } from './source-adapter.js';
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
    const state=this.inbox.filter({ ...this.state, sources: this.registry.sources() });
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
    const c = this.state.conversations.find(c => c.id === id);
    if (!c) throw new AppError(404, 'Диалог не найден. Обновите ленту.');
    return c;
  }
  //: Запускает ручное обновление метаданных разрешённых диалогов.
  //: Повторный параллельный вызов использует тот же pendingRefresh.
  refresh(): Promise<Snapshot> {
    if (this.pendingRefresh) return this.pendingRefresh;
    this.pendingRefresh = this.doRefresh().finally(() => { this.pendingRefresh = undefined; });
    return this.pendingRefresh;
  }
  //: Обновляет каталог и непрочитанные без обхода истории чатов.
  //: Загруженные ранее сообщения остаются в ограниченном кеше разрешённых ID.
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
      const ids=new Set(conversations.map(c=>c.id));
      const messages=this.state.messages.filter(m=>ids.has(m.conversationId));
      for (const c of conversations) c.preview = messages.filter(m => m.conversationId === c.id).at(-1)?.text || '';
      this.state = { conversations, messages: this.sorted(messages), sources: this.adapters.map(a => a.source), refreshedAt: new Date().toISOString(), stale: false };
      this.persist();
      return this.snapshot();
    } catch {
      this.state.stale = true;
      throw new AppError(503, 'Не удалось обновить сообщения. Проверьте подключение Telegram и повторите вручную.');
    }
  }
  //: Убирает дубликаты ID и упорядочивает сообщения по времени.
  //: При равной дате сравнивает ID и оставляет только cachedMessages последних.
  private sorted(messages: Message[]) {
    return [...new Map(messages.map(m => [m.id, m])).values()].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).slice(-LIMITS.cachedMessages);
  }
  //: Нормализует текущие сообщения и сохраняет снимок.
  //: SQLite получает ограниченный JSON-кеш без секретов источников.
  private persist() { this.state.messages = this.sorted(this.state.messages); this.store.saveCache(this.state); }
  //: Загружает одну страницу выбранного диалога независимо от общего кеша.
  //: before загружает предыдущие 10; ревизия запрещает выдачу отозванного доступа.
  async open(id: string,before?:string):Promise<ConversationPageResult> {
    const c = this.conversation(id);
    if(before!==undefined&&(!before||before.length>1024))throw new AppError(400,'Некорректный курсор сообщений.');
    const revision=this.selection.revision;
    const adapter = this.adapter(c.sourceId);
    let page;
    try{
      if(before&&!adapter.messagePage)throw new AppError(400,'Источник не поддерживает загрузку предыдущих сообщений.');
      page=adapter.messagePage?await adapter.messagePage(id,LIMITS.pageMessages,before):{conversationId:id,messages:await adapter.recentMessages(id,LIMITS.pageMessages),nextCursor:null};
    }catch(error){if(error instanceof AppError)throw error;throw new AppError(503,'Не удалось загрузить сообщения этого диалога. Повторите вручную.');}
    this.selection.require(id);
    if(revision!==this.selection.revision)throw new AppError(409,'Выбор диалогов изменился. Обновите чат.');
    if(page.conversationId!==id||page.messages.length>LIMITS.pageMessages||page.messages.some(m=>m.conversationId!==id||m.sourceId!==c.sourceId)||page.nextCursor===before)throw new AppError(503,'Источник вернул некорректную страницу сообщений.');
    this.state.messages = this.sorted([...(before?this.state.messages:this.state.messages.filter(m => m.conversationId !== id)), ...page.messages]);
    if(!before){c.preview=page.messages.at(-1)?.text||'';const latest=page.messages.at(-1);if(latest){c.updatedAt=latest.date;this.latestSeen.set(id,latest.id);}else this.latestSeen.delete(id);}
    this.state.refreshedAt=new Date().toISOString();this.state.stale=false;
    this.persist();
    return {page,snapshot:this.snapshot()};
  }
  //: Явно отмечает диалог прочитанным через адаптер.
  //: Ориентируется на последнее загруженное сообщение и сохраняет нулевой счётчик.
  async markRead(id: string) {
    const c = this.conversation(id);
    const latest = this.latestSeen.get(id)||this.state.messages.filter(m => m.conversationId === id).at(-1)?.id;
    if (latest) {
      await this.adapter(c.sourceId).markRead(id, latest);
      c.unreadCount = 0;
      this.persist();
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
      this.state.messages = this.sorted([...this.state.messages, message]);
      this.latestSeen.set(c.id,message.id);
      c.preview = message.text; c.updatedAt = message.date;
      this.persist();
      return message;
    }).catch(() => { throw new AppError(502, 'Результат отправки неизвестен. Обновите ленту перед новой попыткой, чтобы избежать дубликата.'); });
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
