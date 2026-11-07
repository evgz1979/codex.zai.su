# backend/core/source-adapter.ts

Общий провайдерный контракт без реализации будущих источников.

[Исходный модуль](../../backend/core/source-adapter.ts) · [Индекс](README.md)

<a id="symbol-SourceAdapter"></a>

## SourceAdapter

Задаёт контракт чтения, отправки и отметки прочитанного для источника.

Сессии и native API не входят в общие DTO.

```typescript
export interface SourceAdapter {
    readonly source: Source;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    listConversations(): Promise<Conversation[]>;
    recentMessages(conversationId: string, limit: number): Promise<Message[]>;
    sendText(destination: Destination, text: string): Promise<Message>;
    markRead(conversationId: string, messageId: string): Promise<void>;
}
```
