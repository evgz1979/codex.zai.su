import type { Conversation, AdminStatus, AdminDialogCatalog } from '../../shared/types.js';
import type { Store } from '../storage/store.js';
import type { SecretVault } from '../storage/private-files.js';
import type { MessengerService } from '../core/service.js';
import type { TelegramAdapter } from '../connectors/telegram/adapter.js';
import { TelegramLogin } from '../auth/telegram-login.js';
import { passwordHash, type Role } from '../auth/auth.js';
import { AppError } from '../core/errors.js';
import {PASSWORD_LIMITS} from '../../shared/types.js';
import type {WhatsAppAdapter} from '../connectors/whatsapp/adapter.js';
//: Выполняет административные операции над источником и разрешениями.
//: Возвращает только статусы и метаданные, без Telegram-секретов.
export class AdminService {
  readonly login: TelegramLogin;
  private catalog: Conversation[]=[];
  private whatsappCatalog: Conversation[]=[];
  //: Связывает административный сервис с ядром, Telegram и хранилищем.
  //: Тестовая фабрика авторизации не используется production-точкой входа.
  constructor(private core: MessengerService, private telegram: TelegramAdapter, private vault: SecretVault, private store: Store, login?: TelegramLogin,readonly whatsapp?:WhatsAppAdapter) { this.login=login||new TelegramLogin(vault); }
  //: Возвращает статус источника и количество разрешённых диалогов.
  //: Не возвращает ключи, сессию, телефон, код или 2FA.
  status(): AdminStatus { return { telegram:{configured:this.vault.exists(),connected:this.telegram.source.connected,stage:this.vault.exists()?'connected':this.login.stage,...(!this.vault.exists()&&this.login.issue?{issue:this.login.issue}:{})},...(this.whatsapp?{whatsapp:this.whatsapp.status()}:{}),selectedCount:this.core.selection.ids().length }; }
  //: Получает каталог метаданных с папками источника для выбора диалогов.
  //: Историю не запрашивает, preview очищается; папки не меняют разрешения.
  async dialogs():Promise<AdminDialogCatalog> {
    const catalog=this.telegram.listConversationCatalog?await this.telegram.listConversationCatalog():{conversations:await this.telegram.listConversations(),folders:[],truncated:false};
    this.catalog=catalog.conversations;
    return {...catalog,conversations:this.catalog.map(c=>({...c,preview:''})),selectedIds:this.core.selection.ids().filter(id=>this.catalog.some(c=>c.id===id))};
  }
  //: Получает отдельный каталог WhatsApp без истории и превью.
  //: Выбор Telegram сохраняется независимо от текущего экрана источника.
  async whatsappDialogs():Promise<AdminDialogCatalog>{
    if(!this.whatsapp)throw new AppError(503,'WhatsApp недоступен.');await this.whatsapp.connect();
    if(!this.whatsapp.source.connected)throw new AppError(409,'Сначала подключите WhatsApp.');
    this.whatsappCatalog=await this.whatsapp.listConversations();
    return {conversations:this.whatsappCatalog,folders:[],truncated:this.whatsappCatalog.length>=1000,selectedIds:this.core.selection.ids().filter(id=>this.whatsappCatalog.some(c=>c.id===id))};
  }
  //: Заменяет выбор только в полученном каталоге WhatsApp.
  //: Чужие источники и исключённый архив SQLite не удаляются.
  selectWhatsApp(ids:string[]){this.core.selection.replace(ids,this.whatsappCatalog);this.store.saveCache({conversations:this.whatsappCatalog.filter(c=>ids.includes(c.id)),messages:[],sources:[],refreshedAt:null,stale:true});this.core.reset();return ids;}
  //: Снимает разрешения только указанного источника.
  //: Не затрагивает выбор и историю другого подключённого мессенджера.
  private unselect(sourceId:string){const ids=this.core.selection.ids();const catalog=ids.map(id=>this.store.conversation(id)).filter((c):c is Conversation=>!!c);this.store.select(ids.filter(id=>!id.startsWith(encodeURIComponent(sourceId)+':')),catalog);this.core.selection.revision++;this.core.reset();}
  //: Отзывает WhatsApp-сессию без отключения Telegram.
  //: Сохранённая история остаётся на сервере, QR исчезает из админки.
  async disconnectWhatsApp(){if(!this.whatsapp)throw new AppError(503,'WhatsApp недоступен.');await this.whatsapp.revoke();this.unselect('whatsapp');this.whatsappCatalog=[];}
  //: Сохраняет разрешённые ID и перестраивает видимый снимок.
  //: Нельзя разрешить ID, отсутствующий в полученном каталоге.
  select(ids: string[]) { this.core.selection.replace(ids,this.catalog);this.store.saveCache({conversations:this.catalog.filter(c=>ids.includes(c.id)),messages:[],sources:[],refreshedAt:null,stale:true}); this.core.reset(); return this.core.selection.ids(); }
  //: Отменяет вход и удаляет локальный доступ Telegram.
  //: Снимает выбор диалогов, сохраняя прежний архив SQLite.
  async disconnect() { await this.login.cancel(); await this.telegram.revoke(); this.unselect(this.telegram.source.id); this.catalog=[]; }
  //: Заменяет Argon2id-хеш пароля выбранной роли.
  //: Длина от 8 до 512 символов; HTTP-слой отзывает сессии роли.
  async changePassword(role: Role, password: string) { if (password.length<PASSWORD_LIMITS.min || password.length>PASSWORD_LIMITS.max) throw new AppError(400,'Пароль должен содержать от 8 до 512 символов.'); this.store.set(`auth.${role}`,await passwordHash(password)); }
  //: Завершает незаконченный процесс Telegram-входа.
  //: Используется при остановке приложения.
  async close() { await this.login.cancel(); }
}
