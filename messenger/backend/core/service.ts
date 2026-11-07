import type { SourceAdapter } from './source-adapter.js';
import type { Store } from '../storage/store.js';
import { destinationFor, LIMITS, type Conversation, type Message, type SendRequest, type Snapshot } from '../../shared/types.js';
//: Описывает безопасную прикладную ошибку API.
//: Содержит HTTP-статус и текст без внутреннего исключения Telegram.
export class AppError extends Error {
  //: Задаёт статус и пользовательское сообщение ошибки.
  //: Стек и секретные данные не включаются в HTTP-ответ.
  constructor(public status: number, message: string) { super(message); } }
//: Объединяет источники в общую ленту и проверяет отправки.
//: Зависит от SourceAdapter и Store, без Telegram-специфичных ID.
export class MessengerService {
  private state: Snapshot;
  private pendingRefresh?: Promise<Snapshot>;
  private sends = new Map<string, { signature: string; result: Promise<Message>; created: number }>();
  //: Загружает ограниченный кеш либо пустой снимок.
  //: Загруженные данные сразу помечаются устаревшими.
  constructor(private adapters: SourceAdapter[], private store: Store) {
    this.state = store.loadCache() ?? { sources: [], conversations: [], messages: [], refreshedAt: null, stale: true };
    this.state.stale = true;
  }
  //: Возвращает текущий снимок и состояния зарегистрированных источников.
  //: Не обращается к сети и не передаёт credentials адаптеров.
  snapshot(): Snapshot {
    return { ...this.state, sources: this.adapters.map(a => a.source) };
  }
  //: Ищет зарегистрированный источник по sourceId.
  //: Неизвестный источник отклоняется с 409.
  private adapter(id: string) {
    const adapter = this.adapters.find(a => a.source.id === id);
    if (!adapter) throw new AppError(409, 'Источник недоступен. Обновите ленту.');
    return adapter;
  }
  //: Ищет диалог только среди известных серверу DTO.
  //: Отсутствующий conversationId отклоняется с 404.
  private conversation(id: string): Conversation {
    const c = this.state.conversations.find(c => c.id === id);
    if (!c) throw new AppError(404, 'Диалог не найден. Обновите ленту.');
    return c;
  }
  //: Запускает ручное обновление общей ленты.
  //: Повторный параллельный вызов использует тот же pendingRefresh.
  refresh(): Promise<Snapshot> {
    if (this.pendingRefresh) return this.pendingRefresh;
    this.pendingRefresh = this.doRefresh().finally(() => { this.pendingRefresh = undefined; });
    return this.pendingRefresh;
  }
  //: Загружает диалоги и ограниченную свежую выборку сообщений.
  //: Успех заменяет снимок, ошибка помечает прежний снимок stale и возвращает 503.
  private async doRefresh(): Promise<Snapshot> {
    try {
      const conversations: Conversation[] = [];
      const messages: Message[] = [];
      for (const adapter of this.adapters) {
        await adapter.connect();
        conversations.push(...await adapter.listConversations());
      }
      conversations.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
      for (const c of conversations.slice(0, LIMITS.recentConversations)) {
        messages.push(...await this.adapter(c.sourceId).recentMessages(c.id, LIMITS.messagesPerConversation));
      }
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
  //: Подгружает сообщения выбранного диалога в общую ленту.
  //: Заменяет сообщения этого диалога, не помечая его прочитанным.
  async open(id: string) {
    const c = this.conversation(id);
    const adapter = this.adapter(c.sourceId);
    const messages = await adapter.recentMessages(id, LIMITS.selectedMessages);
    this.state.messages = this.sorted([...this.state.messages.filter(m => m.conversationId !== id), ...messages]);
    this.persist();
    return this.snapshot();
  }
  //: Явно отмечает диалог прочитанным через адаптер.
  //: Ориентируется на последнее загруженное сообщение и сохраняет нулевой счётчик.
  async markRead(id: string) {
    const c = this.conversation(id);
    const latest = this.state.messages.filter(m => m.conversationId === id).at(-1);
    if (latest) {
      await this.adapter(c.sourceId).markRead(id, latest.id);
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
      const message = await this.adapter(c.sourceId).sendText(expected, input.text);
      this.state.messages = this.sorted([...this.state.messages, message]);
      c.preview = message.text; c.updatedAt = message.date;
      this.persist();
      return message;
    }).catch(() => { throw new AppError(502, 'Результат отправки неизвестен. Обновите ленту перед новой попыткой, чтобы избежать дубликата.'); });
    this.sends.set(input.requestId, { signature, result, created: Date.now() });
    return result;
  }
  //: Закрывает соединения всех зарегистрированных источников.
  //: Ожидает allSettled, чтобы ошибка одного адаптера не пропустила остальные.
  async disconnect() { await Promise.allSettled(this.adapters.map(a => a.disconnect())); }
}
