import type { TelegramClient } from 'teleproto';
import type { TelegramAuthStage } from '../../shared/types.js';
import type { SecretVault } from '../storage/private-files.js';
import { telegramClient } from '../connectors/telegram/client.js';
import { AppError } from '../core/errors.js';
//: Управляет пошаговым Telegram-входом из защищённой админки.
//: Код и 2FA передаются одноразовому callback, не записываются в файлы и ответы.
export class TelegramLogin {
  stage: TelegramAuthStage = 'idle';
  private client?: TelegramClient;
  private answer?: (value: string) => void;
  private rejectAnswer?: (error: Error) => void;
  private waiter?: (stage: TelegramAuthStage) => void;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  //: Подключает vault и фабрику MTProto-клиента.
  //: В production используется только штатный приватный клиент.
  constructor(private vault: SecretVault, private factory = telegramClient) {}
  //: Публикует безопасное имя следующего шага.
  //: Разрешает ожидающий HTTP-запрос без передачи введённого секрета.
  private setStage(stage: TelegramAuthStage) { this.stage=stage; this.waiter?.(stage); this.waiter=undefined; }
  //: Ожидает смену этапа авторизации.
  //: Одновременно активен один переход и один ожидающий ответ.
  private waitStage() { return new Promise<TelegramAuthStage>(resolve=> { this.waiter=resolve; }); }
  //: Передаёт код или 2FA одноразовому callback teleproto.
  //: В объекте сервиса хранится resolver, а не значение кода или пароля.
  private prompt(stage: 'code'|'password') {
    return new Promise<string>((resolve,reject)=> { this.answer=resolve; this.rejectAnswer=reject; this.setStage(stage); });
  }
  //: Начинает авторизацию по api_id, api_hash и телефону.
  //: Проверяет поля, ограничивает жизнь входа пятью минутами, не подключает реальный аккаунт автоматически.
  async begin(input: {apiId:number;apiHash:string;phone:string}) {
    if (this.running || this.vault.exists()) throw new AppError(409,'Сначала отключите существующий Telegram или отмените вход.');
    if (!Number.isSafeInteger(input.apiId) || input.apiId<=0 || !/^[a-f0-9]{32}$/i.test(input.apiHash) || !/^\+[0-9]{7,16}$/.test(input.phone)) throw new AppError(400,'Проверьте api_id, api_hash и номер телефона.');
    this.stage='connecting';
    const next=this.waitStage();
    const credentials={ apiId:input.apiId,apiHash:input.apiHash,session:'' };
    const phone=input.phone;
    this.client=this.factory(credentials);
    const client=this.client;
    this.timer=setTimeout(()=> { void this.cancel(); },5*60000); this.timer.unref();
    this.running=(async()=> {
      try {
        await client.start({ phoneNumber:phone,phoneCode:()=>this.prompt('code'),password:()=>this.prompt('password'),acceptTermsOfService:async()=>false,onError:async()=>true });
        if (!await client.checkAuthorization()) throw new Error();
        const me=await client.getMe();
        const session=client.session.save() as unknown as string;
        if (!session) throw new Error();
        this.vault.save({...credentials,session,accountId:me.id.toString()});
        await client.destroy(); this.client=undefined;
        this.setStage('connected');
      } catch { this.setStage('error'); }
      finally { this.answer=undefined; this.rejectAnswer=undefined; clearTimeout(this.timer); if(this.client===client)await client.destroy(); this.client=undefined; this.running=undefined; }
    })();
    return next;
  }
  //: Передаёт секрет только ожидающему шагу code или password.
  //: Повторный или неверный этап отклоняется, значение не сохраняется.
  async submit(stage: 'code'|'password', value: string) {
    if (this.stage!==stage || !this.answer || !value || value.length>512) throw new AppError(409,'Шаг авторизации недоступен. Обновите статус.');
    const next=this.waitStage(); const answer=this.answer;
    this.answer=undefined; this.rejectAnswer=undefined; this.stage='connecting'; answer(value);
    return next;
  }
  //: Отменяет ожидание секрета и закрывает клиент.
  //: Не оставляет незавершённые callbacks или таймер авторизации.
  async cancel() {
    this.rejectAnswer?.(new Error('AUTH_USER_CANCEL')); this.answer=undefined; this.rejectAnswer=undefined;
    if (this.client) await this.client.destroy();
    await this.running;
    clearTimeout(this.timer); this.setStage('idle');
  }
}
