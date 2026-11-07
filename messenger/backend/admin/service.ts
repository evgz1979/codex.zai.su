import type { Conversation, AdminStatus } from '../../shared/types.js';
import type { Store } from '../storage/store.js';
import type { SecretVault } from '../storage/private-files.js';
import type { MessengerService } from '../core/service.js';
import type { TelegramAdapter } from '../connectors/telegram/adapter.js';
import { TelegramLogin } from '../auth/telegram-login.js';
import { passwordHash, type Role } from '../auth/auth.js';
import { AppError } from '../core/errors.js';
//: Выполняет административные операции над источником и разрешениями.
//: Возвращает только статусы и метаданные, без Telegram-секретов.
export class AdminService {
  readonly login: TelegramLogin;
  private catalog: Conversation[]=[];
  //: Связывает административный сервис с ядром, Telegram и хранилищем.
  //: Тестовая фабрика авторизации не используется production-точкой входа.
  constructor(private core: MessengerService, private telegram: TelegramAdapter, private vault: SecretVault, private store: Store, login?: TelegramLogin) { this.login=login||new TelegramLogin(vault); }
  //: Возвращает статус источника и количество разрешённых диалогов.
  //: Не возвращает ключи, сессию, телефон, код или 2FA.
  status(): AdminStatus { return { telegram:{configured:this.vault.exists(),connected:this.telegram.source.connected,stage:this.vault.exists()?'connected':this.login.stage,...(!this.vault.exists()&&this.login.issue?{issue:this.login.issue}:{})},selectedCount:this.core.selection.ids().length }; }
  //: Получает каталог метаданных для выбора диалогов.
  //: Историю не запрашивает, preview очищается перед ответом.
  async dialogs() { this.catalog=await this.telegram.listConversations(); return {conversations:this.catalog.map(c=>({...c,preview:''})),selectedIds:this.core.selection.ids()}; }
  //: Сохраняет разрешённые ID и перестраивает видимый снимок.
  //: Нельзя разрешить ID, отсутствующий в полученном каталоге.
  select(ids: string[]) { this.core.selection.replace(ids,this.catalog); this.core.reset(); return this.core.selection.ids(); }
  //: Отменяет вход и удаляет локальный доступ Telegram.
  //: Снимает выбор диалогов, сохраняя прежний архив SQLite.
  async disconnect() { await this.login.cancel(); await this.telegram.revoke(); this.core.selection.clear(); this.core.reset(); this.catalog=[]; }
  //: Заменяет Argon2id-хеш пароля выбранной роли.
  //: Длина от 16 до 512 символов; HTTP-слой отзывает сессии роли.
  async changePassword(role: Role, password: string) { if (password.length<16 || password.length>512) throw new AppError(400,'Пароль должен содержать от 16 до 512 символов.'); this.store.set(`auth.${role}`,await passwordHash(password)); }
  //: Завершает незаконченный процесс Telegram-входа.
  //: Используется при остановке приложения.
  async close() { await this.login.cancel(); }
}
