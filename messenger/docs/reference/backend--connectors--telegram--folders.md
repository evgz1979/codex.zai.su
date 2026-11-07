# backend/connectors/telegram/folders.ts

Преобразование папок и правил Telegram в общий административный каталог.

[Исходный модуль](../../backend/connectors/telegram/folders.ts) · [Индекс](README.md)

<a id="symbol-matchesRules"></a>

## matchesRules

Проверяет автоматические правила папки по метаданным диалога.

Явные include/exclude/pinned обрабатываются отдельно с приоритетом exclude.

```typescript
matchesRules(filter: Api.DialogFilter, d: Dialog, defaults: TelegramMuteDefaults, now: number): boolean
```

<a id="symbol-peerId"></a>

## peerId

Нормализует InputPeer в marked ID без access_hash.

Self разрешается по метаданным собственного диалога; неизвестные peer пропускаются.

```typescript
peerId(peer: Api.TypeInputPeer, selfId?: string): string | undefined
```

<a id="symbol-telegramFolders"></a>

## telegramFolders

Преобразует штатные и общие папки Telegram в безопасные общие DTO.

Сохраняет порядок папок/закреплений, учитывает пересечения и только известные ID.

```typescript
telegramFolders(sourceId: string, filters: Api.TypeDialogFilter[], dialogs: Dialog[], available: ReadonlySet<string>, defaults: TelegramMuteDefaults, now = Math.floor(Date.now() / 1000)): ConversationFolder[]
```

<a id="symbol-TelegramMuteDefaults"></a>

## TelegramMuteDefaults

Задаёт глобальные сроки отключения звука по категориям Telegram.

Применяется только при отсутствии индивидуального muteUntil у диалога.

```typescript
export interface TelegramMuteDefaults {
    users: number;
    groups: number;
    channels: number;
}
```
