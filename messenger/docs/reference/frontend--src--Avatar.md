# frontend/src/Avatar.tsx

Круглые фотографии разрешённых диалогов с загрузкой возле видимой области и инициалами.

[Исходный модуль](../../frontend/src/Avatar.tsx) · [Индекс](README.md)

<a id="symbol-Avatar"></a>

## Avatar

Показывает круглое фото возле видимой области либо устойчивые цветные инициалы.

Запрос отменяется при уходе, object URL освобождается; 401 передаётся владельцу входа.

```typescript
Avatar({ conversation, onUnauthorized }: {
    conversation: Conversation;
    onUnauthorized(error: unknown): void;
})
```

<a id="symbol-Avatar.load"></a>

## Avatar.load

Загружает фотографию один раз при приближении к видимой области.

Кеш по ID и версии ограничен 64 Blob; ошибки фото оставляют инициалы.

```typescript
async load()
```

<a id="symbol-clearAvatars"></a>

## clearAvatars

Очищает оперативные фото при смене или завершении веб-входа.

Данные не записываются в браузерное хранилище и не переживают перезагрузку.

```typescript
clearAvatars()
```
