# backend/core/source-adapter.ts

Общий провайдерный контракт без реализации будущих источников.

[Исходный модуль](../../backend/core/source-adapter.ts) · [Индекс](README.md)

<a id="symbol-SourceAdapter"></a>

## SourceAdapter

Задаёт контракт чтения, отправки и необязательного каталога папок источника.

Папки содержат только метаданные и не дают доступа к истории без выбора.

```typescript
export interface SourceAdapter {
    readonly source: Source;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    listConversations(): Promise<Conversation[]>;
    listConversationCatalog?(): Promise<ConversationCatalog>;
    recentMessages(conversationId: string, limit: number): Promise<Message[]>;
    sendText(destination: Destination, text: string): Promise<Message>;
    markRead(conversationId: string, messageId: string): Promise<void>;
}
```
