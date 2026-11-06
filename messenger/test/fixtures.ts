// Только синтетические данные тестов. Не подключается к production entrypoint.
import type { SourceAdapter } from '../backend/core/source-adapter.js';
import { destinationFor, entityId, type Conversation, type Destination, type Message, type Source } from '../shared/types.js';
export class TestAdapter implements SourceAdapter {
  source: Source;
  conversations: Conversation[];
  messages: Message[];
  sent: { destination: Destination; text: string }[] = [];
  reads: string[] = [];
  calls: number[] = [];
  fail = false;
  constructor(sourceId = 'test-a', name = 'Тестовый источник') {
    this.source = { id: sourceId, name, kind: 'test', connected: false };
    this.conversations = ['Анна Смирнова', 'Команда проекта', 'Алексей'].map((title,i) => ({
      id: entityId(sourceId,'conversation',String(i)), sourceId,
      title, kind: i === 1 ? 'group' : 'direct', recipient: { id: entityId(sourceId,'recipient',String(i)), name: title },
      unreadCount: i === 0 ? 3 : 0, preview: ['Увидимся завтра в 10?', 'Всё готово к встрече.', 'Отлично, спасибо!'][i],
      updatedAt: `2026-11-07T10:0${i}:00.000Z`, canSend: true,
    }));
    this.messages = this.conversations.map((c,i) => ({
      id: entityId(sourceId, 'message', String(i)), sourceId, conversationId: c.id,
      sender: { id: entityId(sourceId,'sender','1'), name: c.title }, date: c.updatedAt,
      text: c.preview, outgoing: false, status: 'received', attachments: [],
    }));
  }
  async connect() { if (this.fail) throw new Error('PRIVATE_PROVIDER_ERROR'); this.source.connected = true; }
  async disconnect() { this.source.connected = false; }
  async listConversations() { return structuredClone(this.conversations); }
  async recentMessages(id: string, limit: number) { this.calls.push(limit); return this.messages.filter(m => m.conversationId === id).slice(-limit); }
  async sendText(destination: Destination, text: string): Promise<Message> {
    if (this.fail) throw new Error('PRIVATE_PROVIDER_ERROR');
    this.sent.push({ destination, text });
    const c = this.conversations.find(c => c.id === destination.conversationId)!;
    if (JSON.stringify(destination) !== JSON.stringify(destinationFor(c))) throw new Error('Wrong route');
    const message: Message = { ...this.messages[0], id: entityId(this.source.id,'message', `sent-${this.sent.length}`), sourceId: this.source.id, conversationId: c.id, text, outgoing: true, status: 'sent', date: new Date().toISOString() };
    this.messages.push(message);
    return message;
  }
  async markRead(id: string) { this.reads.push(id); }
}
