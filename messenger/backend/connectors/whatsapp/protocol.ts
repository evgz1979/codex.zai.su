import type {Conversation, Message, WhatsAppStatus} from '../../../shared/types.js';
//: Ограничивает команды локального браузерного процесса.
//: Протокол не принимает URL, JavaScript, shell или произвольные методы клиента.
export type BrowserAction='status'|'start'|'stop'|'logout'|'catalog'|'messages'|'send'|'read';
//: Адресует одну изолированную сессию по непрозрачному серверному ключу.
//: allowed строится backend из текущего выбора, а не из HTTP-запроса пользователя.
export interface BrowserRequest {account:string;action:BrowserAction;interactive?:boolean;allowed?:string[];conversationId?:string;recipientId?:string;messageId?:string;before?:string;text?:string}
//: Возвращает только ограниченные DTO и временный административный QR.
//: Файлы профиля, cookie и нативные объекты Chromium не покидают worker.
export interface BrowserResult {status?:WhatsAppStatus;startup?:BrowserStartup;conversations?:Conversation[];messages?:Message[];nextCursor?:string|null;message?:Message;error?:string}
//: Описывает только булевы признаки первичной готовности браузера.
//: Доступен приватному worker-клиенту владельца, без текстов, адресов, профиля или QR.
export interface BrowserStartup {socketConnected:boolean;hasSynced:boolean;streamReady:boolean;helpersReady:boolean;callbackAvailable:boolean;authenticated:boolean;recoveryRequested:boolean}
//: Проверяет закрытый набор команд до доступа к профилю или браузеру.
//: Невалидный запрос не создаёт каталог и не запускает процесс.
export function browserRequest(value:unknown):BrowserRequest {
  const v=value as BrowserRequest;
  if(!v||typeof v!=='object'||!/^\w{64}$/.test(v.account)||!/^[a-f0-9]{64}$/.test(v.account)||!['status','start','stop','logout','catalog','messages','send','read'].includes(v.action))throw new Error('invalid_request');
  if(v.allowed!==undefined&&(!Array.isArray(v.allowed)||v.allowed.length>1000||v.allowed.some(id=>typeof id!=='string'||id.length>256)))throw new Error('invalid_request');
  if(v.interactive!==undefined&&typeof v.interactive!=='boolean')throw new Error('invalid_request');
  if(['messages','send','read'].includes(v.action)&&(!v.allowed?.includes(v.conversationId!)||typeof v.conversationId!=='string'))throw new Error('not_selected');
  if(v.action==='send'&&(v.recipientId!==v.conversationId?.replace(':conversation:',':recipient:')||typeof v.text!=='string'||!v.text.trim()||v.text.length>4096))throw new Error('invalid_destination');
  if(v.action==='read'&&(typeof v.messageId!=='string'||!v.messageId.startsWith('whatsapp:message:')||v.messageId.length>2048))throw new Error('invalid_destination');
  if(v.before!==undefined&&(typeof v.before!=='string'||v.before.length>512))throw new Error('invalid_cursor');
  return v;
}
