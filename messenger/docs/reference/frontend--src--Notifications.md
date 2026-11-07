# frontend/src/Notifications.tsx

Явное включение, отключение и проверка уведомлений; инструкция установки на iPhone.

[Исходный модуль](../../frontend/src/Notifications.tsx) · [Индекс](README.md)

<a id="symbol-notificationEndpoint"></a>

## notificationEndpoint

Получает endpoint только текущего устройства для явного выхода.

Значение передаётся серверу в POST, без URL, localStorage и журналов.

```typescript
async notificationEndpoint()
```

<a id="symbol-Notifications"></a>

## Notifications

Показывает включение Web Push и установочную инструкцию для iPhone.

Разрешение запрашивается только по нажатию; история и сессии не кешируются.

```typescript
Notifications()
```

<a id="symbol-Notifications.disable"></a>

## Notifications.disable

Сначала отзывает серверную доставку, затем браузерную подписку.

При сетевом отказе UI не объявляет уведомления отключёнными.

```typescript
async disable()
```

<a id="symbol-Notifications.enable"></a>

## Notifications.enable

Вызывает системное разрешение непосредственно из пользовательского нажатия.

Подписка отправляется только chat API с cookie и CSRF после разрешения.

```typescript
async enable()
```

<a id="symbol-Notifications.test"></a>

## Notifications.test

Запрашивает реальную проверочную доставку только этому устройству.

Успех означает приём push-сервисом, отображение проверяет владелец iPhone.

```typescript
async test()
```

<a id="symbol-registration"></a>

## registration

Получает существующую регистрацию без создания фонового кеша.

Отсутствие Service Worker допускается в браузерах без Web Push.

```typescript
async registration()
```

<a id="symbol-unsubscribeNotifications"></a>

## unsubscribeNotifications

Удаляет браузерную подписку после успешного выхода или отключения.

Не изменяет системное разрешение iOS и не затрагивает другие устройства.

```typescript
async unsubscribeNotifications()
```
