# frontend/src/admin/ConversationPicker.tsx

Закладки папок, поиск и независимый от текущей папки выбор диалогов.

[Исходный модуль](../../frontend/src/admin/ConversationPicker.tsx) · [Индекс](README.md)

<a id="symbol-ConversationPicker"></a>

## ConversationPicker

Показывает папки источника отдельными закладками над таблицей диалогов.

Переключение и поиск сохраняют выбор в скрытых папках и не загружают историю.

```typescript
ConversationPicker({ catalog, selected, busy, onChange, onSave }: Props)
```

<a id="symbol-ConversationPicker.navigate"></a>

## ConversationPicker.navigate

Переключает закладки стрелками, Home и End с переносом фокуса.

Мышь и клавиатура изменяют только текущую папку, без изменения разрешений.

```typescript
navigate(e: KeyboardEvent<HTMLButtonElement>, at: number)
```

<a id="symbol-Props"></a>

## Props

Задаёт управляемый выбор диалогов без привязки к конкретному источнику.

Папки фильтруют отображение; onSave получает общий выбор через родителя.

```typescript
interface Props {
    catalog: AdminDialogCatalog;
    selected: string[];
    busy: boolean;
    onChange(ids: string[]): void;
    onSave(): void;
}
```
