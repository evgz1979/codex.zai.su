# backend/admin/service.ts

Настройки, метаданные Telegram и права выбора диалогов.

[Исходный модуль](../../backend/admin/service.ts) · [Индекс](README.md)

<a id="symbol-AdminService"></a>

## AdminService

Выполняет административные операции над источником и разрешениями.

Возвращает только статусы и метаданные, без Telegram-секретов.

```typescript
class AdminService
```

<a id="symbol-AdminService.changePassword"></a>

## AdminService.changePassword

Заменяет Argon2id-хеш пароля выбранной роли.

Длина от 8 до 512 символов; HTTP-слой отзывает сессии роли.

```typescript
async changePassword(role: Role, password: string)
```

<a id="symbol-AdminService.close"></a>

## AdminService.close

Завершает незаконченный процесс Telegram-входа.

Используется при остановке приложения.

```typescript
async close()
```

<a id="symbol-AdminService.constructor"></a>

## AdminService.constructor

Связывает административный сервис с ядром, Telegram и хранилищем.

Тестовая фабрика авторизации не используется production-точкой входа.

```typescript
constructor(private core: MessengerService, private telegram: TelegramAdapter, private vault: SecretVault, private store: Store, login?: TelegramLogin, readonly whatsapp?: WhatsAppAdapter)
```

<a id="symbol-AdminService.dialogs"></a>

## AdminService.dialogs

Получает каталог метаданных с папками источника для выбора диалогов.

Историю не запрашивает, preview очищается; папки не меняют разрешения.

```typescript
async dialogs(): Promise<AdminDialogCatalog>
```

<a id="symbol-AdminService.disconnect"></a>

## AdminService.disconnect

Отменяет вход и удаляет локальный доступ Telegram.

Снимает выбор диалогов, сохраняя прежний архив SQLite.

```typescript
async disconnect()
```

<a id="symbol-AdminService.disconnectWhatsApp"></a>

## AdminService.disconnectWhatsApp

Отзывает WhatsApp-сессию без отключения Telegram.

Сохранённая история остаётся на сервере, QR исчезает из админки.

```typescript
async disconnectWhatsApp()
```

<a id="symbol-AdminService.select"></a>

## AdminService.select

Сохраняет разрешённые ID и перестраивает видимый снимок.

Нельзя разрешить ID, отсутствующий в полученном каталоге.

```typescript
select(ids: string[])
```

<a id="symbol-AdminService.selectWhatsApp"></a>

## AdminService.selectWhatsApp

Заменяет выбор только в полученном каталоге WhatsApp.

Чужие источники и исключённый архив SQLite не удаляются.

```typescript
selectWhatsApp(ids: string[])
```

<a id="symbol-AdminService.status"></a>

## AdminService.status

Возвращает статус источника и количество разрешённых диалогов.

Не возвращает ключи, сессию, телефон, код или 2FA.

```typescript
status(): AdminStatus
```

<a id="symbol-AdminService.unselect"></a>

## AdminService.unselect

Снимает разрешения только указанного источника.

Не затрагивает выбор и историю другого подключённого мессенджера.

```typescript
private unselect(sourceId: string)
```

<a id="symbol-AdminService.whatsappDialogs"></a>

## AdminService.whatsappDialogs

Получает отдельный каталог WhatsApp без истории и превью.

Выбор Telegram сохраняется независимо от текущего экрана источника.

```typescript
async whatsappDialogs(): Promise<AdminDialogCatalog>
```
