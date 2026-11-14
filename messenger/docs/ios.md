# Z AI Messenger для iPhone

Первая сборка 0.1.0 рассчитана на iPhone с iOS 18 или новее. Проект SwiftUI
использует текущее HTTPS API на `msg.zai.su:8443` и не требует запуска сервера
на Mac. В этой сборке доступен основной аккаунт Messenger.

## Установка через Xcode

1. Откройте проект `messenger/ios/ZaiMessenger.xcodeproj`. Из корня репозитория:

   ```bash
   open messenger/ios/ZaiMessenger.xcodeproj
   ```

2. В **Xcode → Settings → Accounts** добавьте свой Apple Account, если его ещё
   нет. Откройте настройки проекта, выберите цель **ZaiMessenger → Signing &
   Capabilities**, включите **Automatically manage signing** и выберите свою
   команду или **Personal Team**. Если идентификатор `su.zai.messenger` недоступен
   вашей команде, задайте уникальный **Bundle Identifier**.
3. Подключите iPhone к Mac, разблокируйте его и подтвердите доверие к компьютеру.
   Выберите iPhone в списке устройств рядом со схемой **ZaiMessenger**. Если
   iPhone запросит [режим разработчика](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device),
   включите его в «Настройки → Конфиденциальность и безопасность» и подтвердите
   после перезапуска.
4. Нажмите **Run** (⌘R). Xcode подпишет и установит приложение. Для бесплатной
   Personal Team [профиль действует семь дней](https://developer.apple.com/help/account/basics/about-your-developer-account),
   после чего приложение нужно заново установить через Xcode.

## Проверка на текущем сервере

1. Войдите паролем чата с главной страницы Messenger. Откройте разрешённый
   диалог и убедитесь, что видны новые и более ранние сообщения.
2. Отправьте один контрольный текст в подходящий чат и проверьте доставку
   в Telegram или WhatsApp. Если результат неизвестен, обновите чат и
   проверьте переписку перед повторной отправкой.
3. Закройте приложение через переключатель и снова откройте. При действующей
   сессии должен открыться список чатов. После команды «Выйти» в меню списка
   приложение должно снова запросить пароль.

Приложение хранит cookie чата в Связке ключей на устройстве, а токен CSRF и
черновики держит в памяти. В настройках списка можно открыть админку в Safari.
Клиент поддерживает отправку текста, показывает названия вложений и обновляет
открытую ленту в активном приложении. Push, автономное чтение и открытие
вложений в эту сборку не входят.

## Проверка контракта без сети

Тест на Mac использует тот же код HTTP-клиента с синтетическими ответами
и временным хранилищем токена в памяти. Запустить из корня репозитория:

```bash
ios_check_dir="$(mktemp -d)"
xcrun swiftc -swift-version 6 \
  messenger/ios/ZaiMessenger/Models.swift \
  messenger/ios/ZaiMessenger/MessengerAPI.swift \
  messenger/ios/test/ContractSmoke.swift -o "$ios_check_dir/ContractSmoke"
"$ios_check_dir/ContractSmoke"
```
