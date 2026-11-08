# backend/core/source-adapter.ts

Общий контракт операций с сообщениями и необязательного каталога папок источника.

[Исходный модуль](../../backend/core/source-adapter.ts) · [Индекс](README.md)

<a id="symbol-AttachmentContent"></a>

## AttachmentContent

Передаёт поток байтов одного вложения внутри backend.

В браузер не передаются native location, ключи и объект клиента.

```typescript
export interface AttachmentContent {
    attachment: Attachment;
    chunks: AsyncIterable<Uint8Array>;
}
```

<a id="symbol-SourceAdapter"></a>

## SourceAdapter

Задаёт контракт чтения страниц, отправки и необязательного каталога папок источника.

allows разрешает превью только выбранных ID; каталог папок остаётся без текстов.

```typescript
export interface SourceAdapter {
    readonly source: Source;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    listConversations(allows?: (conversationId: string) => boolean): Promise<Conversation[]>;
    listConversationCatalog?(): Promise<ConversationCatalog>;
    recentMessages(conversationId: string, limit: number): Promise<Message[]>;
    messagePage?(conversationId: string, limit: number, before?: string): Promise<MessagePage>;
    historyPage?(conversationId: string, before?: string, limit?: number): Promise<HistoryPage>;
    canDiscoverContacts?(): boolean;
    subscribe?(listener: (event: SourceEvent) => void, allows: (conversationId: string) => boolean, discover?: (conversation: Conversation) => boolean): () => void;
    openAvatar?(conversationId: string, signal: AbortSignal): Promise<AsyncIterable<Uint8Array>>;
    openAttachment?(request: AttachmentRequest, signal: AbortSignal): Promise<AttachmentContent>;
    transcribeVoice?(request: AttachmentRequest): Promise<SourceTranscription>;
    sendText(destination: Destination, text: string): Promise<Message>;
    markRead(conversationId: string, messageId: string): Promise<void>;
}
```

<a id="symbol-SourceEvent"></a>

## SourceEvent

Передаёт сообщения, удаления и обновления расшифровки одного источника.

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
} | {
    type: 'transcription';
    sourceId: string;
    request: AttachmentRequest;
    result: SourceTranscription;
};
```

<a id="symbol-SourceTranscription"></a>

## SourceTranscription

Связывает внутреннее задание расшифровки с обновлениями источника.

transcriptionId хранится только на сервере и не входит в публичный DTO.

```typescript
export interface SourceTranscription extends VoiceTranscription {
    transcriptionId: string;
}
```
