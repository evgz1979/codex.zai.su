import {createHash, ECDH} from 'node:crypto';
import * as webpush from 'web-push';
import type {Store} from '../storage/store.js';
import type {Message} from '../../shared/types.js';
import type {MessengerService} from './service.js';
import {AppError} from './errors.js';

//: Хранит приватную подписку устройства и версию пароля владельца.
//: Подписки действуют до отзыва независимо от веб-сессий и не выдаются через API.
interface Device {subscription:webpush.PushSubscription; createdAt:number; credential:string}
//: Отправляет зашифрованный Web Push через стандартную библиотеку.
//: Тесты подменяют транспорт без обращения к Apple или Telegram.
type Transport=(subscription:webpush.PushSubscription,payload:string,options:webpush.RequestOptions)=>Promise<unknown>;

//: Проверяет подписку браузера и фиксированный список push-провайдеров.
//: Произвольные URL, порты, credentials и некорректные P-256 ключи отклоняются.
export function pushSubscription(input:unknown):webpush.PushSubscription {
  try {
    const value=input as webpush.PushSubscription;
    if(!value||typeof value.endpoint!=='string'||value.endpoint.length>2048)throw new Error();
    const url=new URL(value.endpoint);
    const host=url.hostname;
    const allowed=host==='web.push.apple.com'||/^[a-z0-9-]+\.push\.apple\.com$/.test(host)||host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com';
    if(!allowed||url.protocol!=='https:'||url.port||url.username||url.password||url.hash||url.search||url.pathname==='/')throw new Error();
    const keys=value.keys;
    if(!keys||typeof keys.auth!=='string'||typeof keys.p256dh!=='string'||! /^(?:[A-Za-z0-9_-]){22}$/.test(keys.auth)||! /^(?:[A-Za-z0-9_-]){87}$/.test(keys.p256dh))throw new Error();
    const publicKey=Buffer.from(keys.p256dh,'base64url');
    if(Buffer.from(keys.auth,'base64url').length!==16||publicKey.length!==65||publicKey[0]!==4)throw new Error();
    ECDH.convertKey(publicKey,'prime256v1');
    return {endpoint:url.href,keys:{auth:keys.auth,p256dh:keys.p256dh}};
  } catch {throw new AppError(400,'Некорректная подписка уведомлений.');}
}

//: Доставляет нейтральные уведомления только о новых входящих выбранных диалогов.
//: История, правки и отправки исключены; секреты и содержимое сообщений не логируются.
export class PushService {
  private pending=new Map<string,Message>();
  private timer?:ReturnType<typeof setTimeout>;
  private running?:Promise<void>;
  private stopped=false;
  private unsubscribe:()=>void;
  //: Подписывает доставку на события ядра без отдельного порта или процесса.
  //: Сеть изолирована транспортом; ошибки push не прерывают Telegram-синхронизацию.
  constructor(private core:MessengerService,private store:Store,private origin:string,private transport:Transport=webpush.sendNotification,private now=Date.now) {
    this.unsubscribe=core.onIncoming(message=>this.enqueue(message));
  }
  //: Связывает подписки с текущим паролем чата без хранения исходного пароля.
  //: Смена пароля, включая CLI, делает прежние подписки недействительными.
  private credential(){return createHash('sha256').update(this.store.get('auth.chat')||'').digest('hex');}
  //: Читает только действующие подписки из приватных настроек SQLite.
  //: Устаревшие записи удаляются; исходные endpoint и ключи не возвращаются клиенту.
  private devices():Device[]{
    const all=JSON.parse(this.store.get('push.devices')||'[]') as Device[];
    const valid=all.filter(device=>device.credential===this.credential());
    if(all.length!==valid.length)this.save(valid);
    return valid;
  }
  //: Заменяет ограниченный список устройств в приватном хранилище.
  //: Данные остаются вне релиза и Git вместе с остальными настройками.
  private save(devices:Device[]){this.store.set('push.devices',JSON.stringify(devices));}
  //: Создаёт одну постоянную пару VAPID при первом включении функции.
  //: В HTTP попадает только публичный ключ; privateKey остаётся в SQLite.
  private keys():{publicKey:string;privateKey:string}{
    const saved=this.store.get('push.vapid');if(saved)return JSON.parse(saved);
    const keys=webpush.generateVAPIDKeys();this.store.set('push.vapid',JSON.stringify(keys));return keys;
  }
  //: Возвращает публичную конфигурацию для PushManager браузера.
  //: Production использует существующий HTTPS origin, новых сетевых входов нет.
  configuration(){return {publicKey:this.keys().publicKey};}
  //: Проверяет регистрацию только переданного endpoint.
  //: Список и реквизиты других устройств никогда не выдаются.
  registered(endpoint:unknown){return typeof endpoint==='string'&&this.devices().some(device=>device.subscription.endpoint===endpoint);}
  //: Сохраняет разрешённую браузером подписку до явного отзыва или отказа провайдера.
  //: Автовосстановление сохраняет дату первого включения без повторной отправки старой истории.
  subscribe(input:unknown){
    const subscription=pushSubscription(input);const devices=this.devices();
    const previous=devices.find(device=>device.subscription.endpoint===subscription.endpoint);
    if(!previous&&devices.length>=10)throw new AppError(409,'Достигнут предел: 10 устройств. Выйдите из Messenger на одном из старых устройств.');
    this.keys();
    this.save([...devices.filter(device=>device!==previous),{subscription,createdAt:previous?.createdAt??Math.floor(this.now()/1000)*1000,credential:this.credential()}]);
  }
  //: Удаляет подписку текущего устройства при отключении или явном выходе.
  //: Другие устройства сохраняют собственное разрешение.
  remove(endpoint:unknown){if(typeof endpoint!=='string'||endpoint.length>2048)throw new AppError(400,'Некорректная подписка уведомлений.');this.save(this.devices().filter(device=>device.subscription.endpoint!==endpoint));}
  //: Отзывает все устройства при смене пароля чата через админку.
  //: Постоянная VAPID-пара сохраняется для последующего явного включения.
  clear(){this.save([]);this.pending.clear();}
  //: Отправляет явную проверку только зарегистрированному устройству владельца.
  //: Endpoint и ошибка провайдера не включаются в HTTP-ответ.
  async test(endpoint:unknown){
    const device=this.devices().find(item=>item.subscription.endpoint===endpoint);if(!device)throw new AppError(409,'Сначала включите уведомления на этом устройстве.');
    try{await this.transport(device.subscription,JSON.stringify({kind:'test'}),{vapidDetails:{subject:this.origin,...this.keys()},TTL:60,urgency:'high',timeout:10000});}
    catch(error){const status=(error as {statusCode?:number})?.statusCode;if(status===404||status===410)this.remove(device.subscription.endpoint);throw new AppError(502,'Не удалось отправить проверку уведомлений.');}
  }
  //: Объединяет близкие новые события в одну короткую доставку.
  //: Очередь ограничена и живёт в памяти; архив в неё не помещается.
  private enqueue(message:Message){
    if(this.stopped||message.outgoing||!this.devices().length)return;
    this.pending.set(message.id,message);if(this.pending.size>128)this.pending.delete(this.pending.keys().next().value!);
    this.schedule();
  }
  //: Планирует один ограниченный пакет без параллельных отправителей.
  //: Таймер не удерживает процесс после штатного завершения.
  private schedule(){if(this.timer||this.stopped)return;this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},500);this.timer.unref();}
  //: Повторно проверяет выбор, удаление сообщения и срок подписки перед доставкой.
  //: HTTP 404/410 удаляют подписку; временные ошибки не раскрываются и не создают цикл.
  flush():Promise<void>{
    if(this.running)return this.running;
    clearTimeout(this.timer);this.timer=undefined;
    const messages=[...this.pending.values()];this.pending.clear();
    this.running=(async()=>{
      for(const device of this.devices()){
        if(this.stopped||!this.registered(device.subscription.endpoint))continue;
        const fresh=messages.filter(message=>!message.outgoing&&Date.parse(message.date)>=device.createdAt&&Date.parse(message.date)>=this.now()-3600000&&this.core.selection.allows(message.conversationId)&&!!this.store.message(message.id)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))[0];
        if(!fresh)continue;
        const badge=this.store.loadCache().conversations.reduce((count,conversation)=>count+conversation.unreadCount,0);
        const payload=JSON.stringify({title:'Z AI Messenger',body:'Новое сообщение',badge,conversationId:fresh.conversationId});
        try{await this.transport(device.subscription,payload,{vapidDetails:{subject:this.origin,...this.keys()},TTL:300,urgency:'high',topic:'messenger-incoming',timeout:10000});}
        catch(error){const status=(error as {statusCode?:number})?.statusCode;if(status===404||status===410)this.remove(device.subscription.endpoint);}
      }
    })().catch(()=>{/* Ошибка доставки не меняет результат сохранения сообщения. */}).finally(()=>{this.running=undefined;if(this.pending.size)this.schedule();});
    return this.running;
  }
  //: Отключает события и ожидает текущую отправку перед закрытием SQLite.
  //: Отложенная очередь после остановки не отправляется.
  async stop(){this.stopped=true;this.unsubscribe();clearTimeout(this.timer);this.pending.clear();await this.running;}
}
