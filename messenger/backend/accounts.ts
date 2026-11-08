import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {AuthError,passwordHash} from './auth/auth.js';
import type {Role} from './auth/auth.js';
import {AppError} from './core/errors.js';
import {createAccountRuntime,type AccountRuntime} from './runtime.js';
import {PASSWORD_LIMITS,type AccountInfo} from '../shared/types.js';

//: Хранит метаданные личного аккаунта и признак блокировки.
//: Пароли и Telegram-реквизиты находятся только в отдельном личном каталоге.
export interface AccountRecord extends AccountInfo {enabled:boolean}
//: Соединяет разрешённую запись аккаунта с его личными сервисами.
//: HTTP выбирает экземпляр только по проверенному сервером имени в URL.
export interface ActiveAccount {info:AccountRecord; runtime:AccountRuntime}
//: Создаёт сервисы одного аккаунта без публичного порта.
//: Подмена фабрики нужна только изолированным тестам без Telegram.
type RuntimeFactory=(directory:string,origin:string)=>AccountRuntime;

//: Управляет закрытым списком пользователей и отдельными личными Messenger.
//: Владелец сохраняет прежний каталог; новые аккаунты используют случайные UUID.
export class Accounts {
  readonly owner:ActiveAccount;
  private records:AccountRecord[]=[];
  private active=new Map<string,ActiveAccount>();
  private changing=false;
  private started=false;
  private verifying=false;
  //: Восстанавливает только зарегистрированные аккаунты из приватных настроек владельца.
  //: При повреждённом реестре запуск прекращается; каталоги с диска не обнаруживаются автоматически.
  constructor(private directory:string,private origin:string,private factory:RuntimeFactory=createAccountRuntime) {
    this.owner={info:{id:'owner',username:'owner',displayName:'Владелец',isOwner:true,enabled:true},runtime:factory(directory,origin)};
    const saved=JSON.parse(this.owner.runtime.store.get('accounts.v1')||'[]') as AccountRecord[];
    if(!Array.isArray(saved)||saved.length>4||saved.some(a=>!a||!this.validUsername(a.username)||a.username==='owner'||typeof a.id!=='string'||!/^[a-f0-9-]{36}$/.test(a.id)||a.isOwner!==false||typeof a.enabled!=='boolean'||typeof a.displayName!=='string'||!a.displayName.trim()||a.displayName.length>80)||new Set(saved.map(a=>a.username)).size!==saved.length||new Set(saved.map(a=>a.id)).size!==saved.length)throw new Error('Invalid account registry');
    this.records=saved;
    this.active.set('owner',this.owner);
    for(const info of saved)if(info.enabled)this.open(info);
  }
  //: Проверяет имя, пригодное для персональной ссылки.
  //: Пути, Unicode, точки и зарезервированное имя владельца не принимаются.
  private validUsername(value:unknown):value is string {return typeof value==='string'&&/^[a-z][a-z0-9_-]{1,31}$/.test(value);}
  //: Открывает сервисы аккаунта в каталоге с серверным UUID.
  //: Пользовательское имя никогда не становится путём файловой системы.
  private open(info:AccountRecord){const account={info,runtime:this.factory(join(this.directory,'users',info.id),this.origin)};this.active.set(info.id,account);if(this.started)account.runtime.start();return account;}
  //: Сохраняет только реестр имён, UUID и блокировок в БД владельца.
  //: Содержимое личных БД и секреты в реестр не включаются.
  private save(){this.owner.runtime.store.set('accounts.v1',JSON.stringify(this.records));}
  //: Возвращает метаданные без доступа к чужим личным сервисам.
  //: HTTP разрешает вызов только административной сессии владельца.
  list():AccountRecord[]{return [this.owner.info,...this.records].map(a=>({...a}));}
  //: Находит только включённый аккаунт с точным именем персональной ссылки.
  //: Заблокированное или неизвестное имя не даёт доступ даже при прежнем cookie.
  find(username:string){return [...this.active.values()].find(a=>!a.info.isOwner&&a.info.username===username&&a.info.enabled);}
  //: Проверяет принадлежность экземпляра действующему реестру.
  //: Используется также во время передачи вложений после блокировки аккаунта.
  allows(account:ActiveAccount){return account.info.enabled&&this.active.get(account.info.id)===account;}
  //: Выполняет вход только в выбранный ссылкой аккаунт и роль.
  //: Общий лимит параллельного Argon2 и повторная проверка блокировки защищают VPS.
  async login(account:ActiveAccount,password:string,role:Role){
    if(!this.allows(account))throw new AuthError(401,'Войдите в приложение.');
    if(this.verifying)throw new AuthError(429,'Вход уже выполняется. Повторите через несколько секунд.');
    this.verifying=true;
    try{const result=await account.runtime.auth.login(password,role);if(!this.allows(account)){account.runtime.auth.revoke(role);throw new AuthError(401,'Войдите в приложение.');}return result;}
    finally{this.verifying=false;}
  }
  //: Создаёт закрытый личный аккаунт с начальным паролем обеих ролей.
  //: Не подключает Telegram; максимум четыре гостя, повторное имя и параллельные изменения запрещены.
  async create(input:Record<string,unknown>){
    if(this.changing)throw new AppError(409,'Дождитесь завершения изменения.');
    if(!this.validUsername(input.username)||input.username==='owner')throw new AppError(400,'Имя: 2–32 символа, латинская буква в начале, затем буквы, цифры, _ или -.');
    if(typeof input.displayName!=='string'||!input.displayName.trim()||input.displayName.length>80)throw new AppError(400,'Введите имя до 80 символов.');
    if(typeof input.password!=='string'||input.password.length<PASSWORD_LIMITS.min||input.password.length>PASSWORD_LIMITS.max)throw new AppError(400,'Пароль должен содержать от 8 до 512 символов.');
    if(this.records.some(a=>a.username===input.username))throw new AppError(409,'Это имя уже используется.');
    if(this.records.length>=4)throw new AppError(409,'Доступно не более четырёх личных пользователей.');
    this.changing=true;
    try{
      const hash=await passwordHash(input.password);
      const info:AccountRecord={id:randomUUID(),username:input.username,displayName:input.displayName.trim(),isOwner:false,enabled:true};
      const account=this.open(info);account.runtime.store.set('auth.chat',hash);account.runtime.store.set('auth.admin',hash);
      this.records.push(info);this.save();return {...info};
    }finally{this.changing=false;}
  }
  //: Блокирует или вновь разрешает личный аккаунт без удаления истории.
  //: Блокировка сразу отзывает обе веб-роли и push, затем останавливает личные фоновые задачи.
  async setEnabled(id:unknown,enabled:unknown){
    if(this.changing)throw new AppError(409,'Дождитесь завершения изменения.');
    const info=this.records.find(a=>a.id===id);if(!info||typeof enabled!=='boolean')throw new AppError(400,'Выберите пользователя.');
    if(info.enabled===enabled)return;
    this.changing=true;
    try{
      info.enabled=enabled;this.save();
      if(enabled){this.open(info);return;}
      const account=this.active.get(info.id);this.active.delete(info.id);
      if(account){account.runtime.auth.revoke('chat');account.runtime.auth.revoke('admin');account.runtime.push?.clear();await account.runtime.stop();}
    }finally{this.changing=false;}
  }
  //: Запускает личные синхронизаторы после открытия единственного loopback-порта.
  //: Новые включённые аккаунты запускаются тем же жизненным циклом.
  start(){this.started=true;for(const account of this.active.values())account.runtime.start();}
  //: Останавливает все личные сервисы перед удалением PID-файла.
  //: Сначала закрывает гостей, затем БД владельца с реестром аккаунтов.
  async stop(){this.started=false;for(const account of [...this.active.values()].reverse())await account.runtime.stop();this.active.clear();}
}
