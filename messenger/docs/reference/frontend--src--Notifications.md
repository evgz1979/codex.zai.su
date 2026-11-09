# frontend/src/Notifications.tsx

Одно системное разрешение, автоматическое восстановление и проверка уведомлений; инструкция для iPhone.

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

Постоянно поддерживает разрешённые уведомления и показывает инструкцию для iPhone.

Системное разрешение запрашивается один раз по нажатию; восстановление выполняется автоматически.

```typescript
Notifications()
```

<a id="symbol-Notifications.enable"></a>

## Notifications.enable

Запрашивает первое разрешение непосредственно из пользовательского нажатия.

Последующие восстановления используют granted без повторного requestPermission.

```typescript
async enable(requestPermission: boolean)
```

<a id="symbol-Notifications.restore"></a>

## Notifications.restore

Проверяет разрешение и восстанавливает push при возврате или восстановлении сети.

Сетевой отказ повторяется автоматически, без нового системного запроса.

```typescript
restore()
```

<a id="symbol-Notifications.test"></a>

## Notifications.test

Запрашивает реальную проверочную доставку только этому устройству.

Успех означает приём push-сервисом, отображение проверяет владелец устройства.

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

<a id="symbol-restoreNotifications"></a>

## restoreNotifications

Восстанавливает доставку при уже выданном системном разрешении.

Запрос разрешения не выполняется; endpoint передаётся только защищённому API своего аккаунта.

```typescript
async restoreNotifications()
```

<a id="symbol-unsubscribeNotifications"></a>

## unsubscribeNotifications

Удаляет браузерную подписку после явного выхода.

Не изменяет системное разрешение iOS и не затрагивает другие устройства.

```typescript
async unsubscribeNotifications()
```
