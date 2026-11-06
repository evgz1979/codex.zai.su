import { secretPrompt } from './auth/prompt.js';
import { passwordHash } from './auth/auth.js';
import { Store } from './storage/store.js';
import { SecretVault } from './storage/private-files.js';
import { telegramClient } from './connectors/telegram/client.js';
import { dataDirectory } from './config.js';
process.umask(0o077);
async function main() {
  const command = process.argv[2];
  if (command === 'setup') {
    const password = await secretPrompt('Новый пароль веб-интерфейса (минимум 12 символов)');
    if (password.length < 12 || password.length > 512) throw new Error();
    if (password !== await secretPrompt('Повторите пароль')) throw new Error();
    const store = new Store(dataDirectory);
    try { store.set('password', await passwordHash(password)); } finally { store.close(); }
    console.log('Пароль сохранён. Перезапустите сервер для отзыва старых веб-сессий.');
  } else if (command === 'telegram') {
    console.log('Остановите сервер перед авторизацией. Все поля вводятся скрыто. Ключи и сессия не выводятся.');
    const apiId = Number(await secretPrompt('Telegram api_id'));
    const apiHash = await secretPrompt('Telegram api_hash');
    if (!Number.isSafeInteger(apiId) || apiId <= 0 || !/^[a-f0-9]{32}$/i.test(apiHash)) throw new Error();
    const client = telegramClient({ apiId, apiHash, session: '' });
    try {
      await client.start({
        phoneNumber: () => secretPrompt('Телефон с кодом страны'),
        phoneCode: () => secretPrompt('Код входа из Telegram / SMS'),
        password: () => secretPrompt('Пароль двухэтапной аутентификации Telegram'),
        emailAddress: () => secretPrompt('Email, если Telegram запросил его'),
        emailVerification: () => secretPrompt('Код подтверждения email'),
        acceptTermsOfService: async () => false,
        onError: async () => { console.error('Telegram отклонил вход. Проверьте данные и повторите команду.'); return true; },
      });
      if (!await client.checkAuthorization()) throw new Error();
      const session = client.session.save() as unknown as string;
      if (!session) throw new Error();
      new SecretVault(dataDirectory).save({ apiId, apiHash, session });
      const store = new Store(dataDirectory);
      try { store.clearCache(); } finally { store.close(); }
      console.log('Telegram подключён. Запустите сервер и нажмите «Обновить» в приложении.');
    } finally { await client.destroy(); }
  } else if (command === 'clear') {
    const store = new Store(dataDirectory);
    try { store.clearCache(); } finally { store.close(); }
    console.log('Локальный кеш очищен. Перезапустите сервер.');
  } else throw new Error();
}
main().catch(() => { console.error('Операция не выполнена. Проверьте ввод в локальном терминале. Секреты не выводятся.'); process.exitCode = 1; });
