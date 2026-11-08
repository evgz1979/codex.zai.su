import {Store} from './storage/store.js';
import {SecretVault} from './storage/private-files.js';
import {TelegramAdapter} from './connectors/telegram/adapter.js';
import {AdminService} from './admin/service.js';
import {Auth} from './auth/auth.js';
import {MessengerService} from './core/service.js';
import {AutoSyncService} from './core/sync.js';
import {PushService} from './core/push.js';
import {AttachmentService} from './core/attachments.js';
import {MediaPreloadService} from './core/media-preload.js';
import {WhatsAppAdapter} from './connectors/whatsapp/adapter.js';

//: Объединяет изолированные сервисы одного личного аккаунта.
//: Каждый экземпляр использует собственные БД, Telegram, пароли, кеш и фоновые задачи.
export interface AccountRuntime {
  store:Store; service:MessengerService; auth:Auth; admin?:AdminService;
  attachments?:AttachmentService; push?:PushService;
  start():void; stop():Promise<void>;
}
//: Собирает личный Messenger в заданном приватном каталоге.
//: WhatsApp создаётся только для владельца; остановка завершает задачи перед закрытием SQLite.
export function createAccountRuntime(directory:string,origin:string,isOwner=false):AccountRuntime {
  const store=new Store(directory);
  const vault=new SecretVault(directory);
  const telegram=new TelegramAdapter(vault);
  const whatsapp=isOwner?new WhatsAppAdapter(directory,store):undefined;
  const service=new MessengerService(whatsapp?[telegram,whatsapp]:[telegram],store);
  const admin=new AdminService(service,telegram,vault,store,undefined,whatsapp);
  const sync=new AutoSyncService(service,store);
  const push=new PushService(service,store,origin);
  const attachments=new AttachmentService(service,directory);
  const media=new MediaPreloadService(store,attachments);
  return {store,service,admin,push,attachments,auth:new Auth(store),
    //: Запускает синхронизацию и подготовку медиа личного аккаунта.
    //: Сервис уже создан; повторный внешний порт не открывается.
    start(){void whatsapp?.connect();sync.start();media.start();},
    //: Завершает личные фоновые задачи и закрывает SQLite.
    //: Авторизация Telegram отменяется перед отключением источника.
    async stop(){await media.stop();await sync.stop();await push.stop();await admin.close();await service.disconnect();store.close();},
  };
}
