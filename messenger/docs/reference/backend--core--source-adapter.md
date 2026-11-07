# backend/core/source-adapter.ts

Общий контракт операций с сообщениями и необязательного каталога папок источника.

[Исходный модуль](../../backend/core/source-adapter.ts) · [Индекс](README.md)

<a id="symbol-SourceAdapter"></a>

## SourceAdapter

Задаёт контракт чтения страниц, отправки и необязательного каталога папок источника.

Папки содержат только метаданные и не дают доступа к истории без выбора.

```typescript
export interface SourceAdapter {
    readonly source: Source;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    listConversations(): Promise<Conversation[]>;
    listConversationCatalog?(): Promise<ConversationCatalog>;
    recentMessages(conversationId: string, limit: number): Promise<Message[]>;
    messagePage?(conversationId: string, limit: number, before?: string): Promise<MessagePage>;
    historyPage?(conversationId: string, before?: string, limit?: number): Promise<HistoryPage>;
    subscribe?(listener: (event: SourceEvent) => void, allows: (conversationId: string) => boolean): () => void;
    sendText(destination: Destination, text: string): Promise<Message>;
    markRead(conversationId: string, messageId: string): Promise<void>;
}
```

<a id="symbol-SourceEvent"></a>

## SourceEvent

Передаёт обновлённое сообщение или ключи удалений одного источника.

Ключ удаления включает источник и его область уникальности, без MTProto-объектов.

```typescript
export type SourceEvent = {
    type: 'message';
    message: Message;
    edited?: boolean;
} | {
    type: 'delete';
    sourceId: string;
    keys: string[];
};
```
