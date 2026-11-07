import type { TelegramClient } from 'teleproto';
import type { TelegramAuthStage, TelegramAuthIssue } from '../../shared/types.js';
import type { SecretVault } from '../storage/private-files.js';
import { telegramClient } from '../connectors/telegram/client.js';
import { AppError } from '../core/errors.js';
import { telegramAuthIssue } from './telegram-issue.js';
//: Управляет пошаговым входом Telegram и безопасной причиной отказа.
//: Не хранит коды/2FA, не повторяет sendCode автоматически и ограничивает проверки.
export class TelegramLogin {
  stage: TelegramAuthStage = 'idle';
  issue?: TelegramAuthIssue;
  private client?: TelegramClient;
  private answer?: (value:string)=>void;
  private rejectAnswer?: (error:Error)=>void;
  private waiter?: (stage:TelegramAuthStage)=>void;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private cancelled=false;
  private attempts=0;
  //: Подключает серверный vault и штатную либо тестовую фабрику.
  //: Не читает секреты обратно в административные ответы.
  constructor(private vault:SecretVault,private factory=telegramClient) {}
  //: Передаёт ожидающему HTTP-запросу только безопасное имя этапа.
  //: Один resolver обслуживает один переход авторизации.
  private setStage(stage:TelegramAuthStage) {this.stage=stage;this.waiter?.(stage);this.waiter=undefined;}
  //: Ожидает следующий переход процесса входа.
  //: Значение введённого секрета сюда не возвращается.
  private waitStage() {return new Promise<TelegramAuthStage>(resolve=>{this.waiter=resolve;});}
  //: Запрашивает код или 2FA у владельца через одноразовый callback.
  //: Повтор неверного значения сохраняет текущий запрос кода Telegram.
  private prompt(stage:'code'|'password') {return new Promise<string>((resolve,reject)=>{this.answer=resolve;this.rejectAnswer=reject;this.setStage(stage);});}
  //: Классифицирует отказ без сохранения исходного исключения.
  //: Только неверный код/2FA можно повторить в пределах пяти проверок.
  private onAuthError(error:Error) {
    this.issue=telegramAuthIssue(error);
    return !(['invalid_code','invalid_password'].includes(this.issue.code)&&this.attempts<5&&!this.cancelled);
  }
  //: Начинает один вход по явно введённым реквизитам.
  //: Ошибки создания клиента и сети завершают ожидание безопасным этапом error.
  async begin(input:{apiId:number;apiHash:string;phone:string}) {
    if(this.running||this.vault.exists())throw new AppError(409,'Сначала отключите существующий Telegram или отмените вход.');
    const apiHash=input.apiHash.trim();const phone=input.phone.trim().replace(/[\s()-]/g,'');
    if(!Number.isSafeInteger(input.apiId)||input.apiId<=0||input.apiId>2147483647||!/^[a-f0-9]{32}$/i.test(apiHash)||!/^\+[0-9]{7,16}$/.test(phone))throw new AppError(400,'Проверьте api_id, api_hash и номер телефона.');
    this.stage='connecting';this.issue=undefined;this.cancelled=false;this.attempts=0;
    const next=this.waitStage();const credentials={apiId:input.apiId,apiHash,session:''};
    this.timer=setTimeout(()=>{this.issue={code:'flow_expired'};void this.cancel(true);},5*60000);this.timer.unref();
    this.running=Promise.resolve().then(async()=>{
      let terminal:TelegramAuthStage='error';
      try {
        if(this.cancelled)return;
        const client=this.factory(credentials);this.client=client;
        await client.start({phoneNumber:phone,phoneCode:()=>this.prompt('code'),password:()=>this.prompt('password'),acceptTermsOfService:async()=>false,onError:async error=>this.onAuthError(error)});
        if(this.cancelled)return;
        if(!await client.checkAuthorization()){this.issue={code:'session_failed'};return;}
        const me=await client.getMe();const session=client.session.save() as unknown as string;
        if(!session){this.issue={code:'session_failed'};return;}
        if(this.cancelled)return;
        this.vault.save({...credentials,session,accountId:me.id.toString()});
        this.issue=undefined;terminal='connected';
      }catch(error){if(!this.cancelled)this.issue??=telegramAuthIssue(error);}
      finally{
        this.answer=undefined;this.rejectAnswer=undefined;clearTimeout(this.timer);
        try{await this.client?.destroy();}catch{/* Очистка не должна раскрывать исходное исключение. */}
        this.client=undefined;this.running=undefined;
        this.setStage(this.cancelled?(this.issue?'error':'idle'):terminal);
      }
    });
    return next;
  }
  //: Передаёт значение только ожидающему шагу code или password.
  //: Не выводит значение в ответ или журнал и ограничивает число проверок.
  async submit(stage:'code'|'password',value:string) {
    const secret=stage==='code'?value.trim():value;
    if(this.stage!==stage||!this.answer||!secret||secret.length>512)throw new AppError(409,'Шаг авторизации недоступен. Обновите статус.');
    const next=this.waitStage();const answer=this.answer;
    this.answer=undefined;this.rejectAnswer=undefined;this.issue=undefined;this.attempts++;this.stage='connecting';answer(secret);
    return next;
  }
  //: Отменяет ожидание и закрывает клиент без записи введённых секретов.
  //: Истечение таймера сохраняет только категорию flow_expired.
  async cancel(preserveIssue=false) {
    this.cancelled=true;if(!preserveIssue)this.issue=undefined;
    this.rejectAnswer?.(new Error('AUTH_USER_CANCEL'));this.answer=undefined;this.rejectAnswer=undefined;
    try{await this.client?.destroy();}catch{/* Закрытие не сериализуется. */}
    await this.running;clearTimeout(this.timer);this.setStage(preserveIssue?'error':'idle');
  }
}
