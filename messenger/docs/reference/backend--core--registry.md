# backend/core/registry.ts

Реестр подключённых SourceAdapter.

[Исходный модуль](../../backend/core/registry.ts) · [Индекс](README.md)

<a id="symbol-ConnectorRegistry"></a>

## ConnectorRegistry

Регистрирует рабочие источники без знания интерфейса конкретного сервиса.

В production используется только Telegram, будущие адаптеры не имитируются.

```typescript
class ConnectorRegistry
```

<a id="symbol-ConnectorRegistry.constructor"></a>

## ConnectorRegistry.constructor

Регистрирует список действующих адаптеров.

Не создаёт заглушки будущих провайдеров.

```typescript
constructor(readonly adapters: SourceAdapter[])
```

<a id="symbol-ConnectorRegistry.disconnect"></a>

## ConnectorRegistry.disconnect

Закрывает все зарегистрированные адаптеры.

Ошибка одного источника не отменяет закрытие остальных.

```typescript
async disconnect()
```

<a id="symbol-ConnectorRegistry.get"></a>

## ConnectorRegistry.get

Находит адаптер по точному ID экземпляра источника.

Отсутствующий источник отклоняется с 409.

```typescript
get(id: string)
```

<a id="symbol-ConnectorRegistry.sources"></a>

## ConnectorRegistry.sources

Возвращает общие состояния зарегистрированных источников.

В состояниях нет реквизитов авторизации.

```typescript
sources()
```
