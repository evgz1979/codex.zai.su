import { TelegramClient, type Api } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import { Logger, LogLevel } from 'teleproto/extensions/Logger';
import type { SecretVault, TelegramCredentials } from '../../storage/private-files.js';

//: Создаёт клиент teleproto без журналирования секретов.
//: Подключает приватное сохранение сессии и ограниченную сетевую политику.
export function telegramClient(credentials: TelegramCredentials, vault?: SecretVault) {
  //: Связывает StringSession с локальным SecretVault.
  //: Пустое значение сессии не сохраняется.
  class PrivateSession extends StringSession {
    //: Сохраняет актуальную непустую сессию зашифрованной.
    //: Возвращает строку только серверному вызывающему коду, без вывода в журнал.
    save() {
      const session = super.save();
      if (session && vault) vault.save({ ...credentials, session });
      return session;
    }
  }
  //: Расширяет клиент стандартным дедлайном RPC.
  //: Применяет ограничения поверх штатного MTProto-клиента.
  class PrivateClient extends TelegramClient {
    //: Вызывает Telegram RPC с дедлайном по умолчанию.
    //: Явные options могут переопределить timeout; уже отправленный запрос может выполниться.
    override invoke<R extends Api.AnyRequest>(request: R, dcId?: number, options?: Api.ApiCallOptions): Promise<R['__response']> {
      return super.invoke(request, dcId, { timeout: 15000, ...options });
    }
  }
  return new PrivateClient(new PrivateSession(credentials.session), credentials.apiId, credentials.apiHash, {
    baseLogger: new Logger(LogLevel.NONE),
    // В teleproto это число попыток, а не дополнительных повторов: 0 отключает RPC.
    connectionRetries: 2, requestRetries: 3, timeout: 10,
    autoReconnect: false, floodSleepThreshold: 0, catchUp: false,
    deviceModel: 'Z AI Messenger', systemVersion: 'Local', appVersion: '0.1.0',
  });
}
