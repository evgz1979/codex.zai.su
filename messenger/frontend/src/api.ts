import {MEDIA_LIMITS,messengerPageBase,type Attachment,type AttachmentRequest,type SessionInfo} from '../../shared/types';
import {OfflineCache} from './offline-cache';
//: Выбирает путь личного Messenger из проверенного формата ссылки.
//: Имя не берётся из localStorage; API и настройки остаются в одном аккаунте.
export const appBase=messengerPageBase(location.pathname);
//: Сохраняет прежний API-префикс независимо от формы публичной ссылки.
//: Старые cookie остаются действительными при коротком адресе личной страницы.
export const appApiBase=appBase?`/api/u/${appBase.split('/').pop()}`:'/api';
let csrf = '';
const cache=new OfflineCache(appApiBase);
let offline=navigator.onLine===false;
const connectionListeners=new Set<()=>void>();
let revalidating:Promise<void>|undefined;
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('messenger-offline-control'):undefined;
//: Сообщает фактическую недоступность сервера для режима чтения.
//: Возврат navigator.onLine сам по себе ещё не подтверждает связь с Messenger.
export function isOffline(){return offline;}
//: Подписывает интерфейс на смену состояния связи.
//: Состояние не сохраняется в localStorage и не содержит данные аккаунта.
export function subscribeConnection(listener:()=>void){connectionListeners.add(listener);return()=>{connectionListeners.delete(listener);};}
//: Переключает режим связи после сетевого ответа или отказа транспорта.
//: Данные текущей переписки остаются в интерфейсе при потере соединения.
function connection(value:boolean){if(offline===value)return;offline=value;for(const listener of connectionListeners)listener();}
window.addEventListener('offline',()=>connection(true));
//: Очищает кеш при выходе или отзыве входа во всех окнах одного аккаунта.
//: В соседние окна передаётся только API-префикс, без переписки и реквизитов.
async function clearOffline(logoutPending=false){await cache.clear(logoutPending);channel?.postMessage({scope:appApiBase,type:'clear'});}
if(channel)channel.onmessage=event=>{if(event.data?.scope===appApiBase&&event.data.type==='clear'){cache.invalidate();window.dispatchEvent(new Event('messenger:local-logout'));}};
//: Сохраняет CSRF-токен текущей веб-сессии в памяти модуля.
//: Значение не записывается в localStorage или URL.
export function setCsrf(value: string) { csrf = value; }
//: Передаёт HTTP-статус и безопасный текст ошибки UI.
//: Не содержит сырой HTTP-ответ или credentials Telegram.
export class ApiError extends Error {
  //: Создаёт ошибку клиентского API с HTTP-статусом.
  //: Текст берётся из безопасного поля error серверного ответа.
  constructor(public status: number, message: string) { super(message); } }
//: Выполняет same-origin JSON-запрос к фиксированному /api пути.
//: Передаёт cookie/CSRF, запрещает кеш и принимает AbortSignal для смены адресата.
async function network<T>(role:'admin'|'chat',path:string,input?:unknown,signal?:AbortSignal):Promise<T>{
  const controller=new AbortController();
  //: Передаёт отмену владельца HTTP-запросу, не считая её потерей связи.
  //: Дедлайн применяется только к чтению; отправки не повторяются автоматически.
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const read=path==='session'||path==='snapshot'||path.startsWith('access?')||['inbox','open','older'].includes(path);
  const timer=read?setTimeout(abort,8000):undefined;
  let res:Response;
  try{if(navigator.onLine===false)throw new TypeError('Offline');res=await fetch(`${appApiBase}/${role}/${path}`, {
    method: input === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: input === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    signal:controller.signal,
  });}catch(error){if(signal?.aborted)throw error;if(role==='chat')connection(true);throw new ApiError(0,'Нет связи. Доступны сохранённые сообщения.');}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  if(role==='chat'&&read&&res.status>=500){connection(true);throw new ApiError(0,'Сервер недоступен. Доступны сохранённые сообщения.');}
  if(role==='chat')connection(false);
  const result = await res.json().catch(()=>{throw new ApiError(502,'Не удалось прочитать ответ сервера.');});
  if (!res.ok) throw new ApiError(res.status, result.error || 'Операция не выполнена.');
  return result;
}
//: Восстанавливает CSRF и проверяет серверный вход перед выходом из offline-режима.
//: Отложенный локальный выход отзывает cookie прежде, чем разрешается загрузка переписки.
async function reconnect(){
  revalidating??=(async()=>{
    const info=await network<SessionInfo>('chat','session');
    if(await cache.needsLogout()){
      if(info.authenticated){setCsrf(info.csrfToken||'');await network('chat','logout',{});}
      await clearOffline();throw new ApiError(401,'Войдите в приложение.');
    }
    if(!info.authenticated){await clearOffline();throw new ApiError(401,'Войдите в приложение.');}
    setCsrf(info.csrfToken||'');await cache.authorize(info);
  })().finally(()=>{revalidating=undefined;});return revalidating;
}
//: Использует сеть для всех действий и ограниченный кеш только для чтения без связи.
//: Отказы доступа не подменяются кешем; отправка, прочтение и расшифровка offline не выполняются.
export async function api<T>(path:string,input?:unknown,signal?:AbortSignal):Promise<T>{
  const role=/^\/admin\/?$/.test(location.pathname.slice(appBase.length))?'admin':'chat';
  if(role==='admin')return network<T>(role,path,input,signal);
  if(path==='logout'){
    await clearOffline(true);try{const result=await network<T>('chat',path,input,signal);await cache.clear();return result;}catch(error){if(error instanceof ApiError)return {ok:true} as T;throw error;}
  }
  const generation=cache.generation;
  try{
    if(offline&&navigator.onLine!==false&&!['session','login'].includes(path))await reconnect();
    const result=await network<T>('chat',path,input,signal);
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    if(generation!==cache.generation)throw new ApiError(401,'Войдите в приложение.');
    if(path==='session'||path==='login'){
      const info=result as SessionInfo;
      if(path==='session'&&await cache.needsLogout()){
        if(info.authenticated){setCsrf(info.csrfToken||'');await network('chat','logout',{});}
        await cache.clear();return {authenticated:false,setupRequired:false,account:info.account} as T;
      }
      if(info.authenticated){setCsrf(info.csrfToken||'');await cache.authorize(info);}else await clearOffline();
    }else await cache.remember(path,input,result,generation);
    return result;
  }catch(error){
    if(signal?.aborted)throw error;
    if(error instanceof ApiError&&error.status===0){const saved=await cache.read(path,input);if(saved!==undefined)return saved as T;}
    if(error instanceof ApiError&&(error.status===401||error.status===404&&(path==='session'||path.startsWith('access?')))){
      await clearOffline();throw new ApiError(401,error.message);
    }
    throw error;
  }
}

//: Загружает байты одного вложения только по явному запросу через chat API.
//: Cookie и CSRF остаются same-origin; произвольные URL и секреты источника не принимаются.
export async function attachmentData(input:AttachmentRequest,signal:AbortSignal):Promise<{blob:Blob;attachment:Attachment}>{
  const response=await fetch(`${appApiBase}/chat/attachment`,{method:'POST',credentials:'same-origin',cache:'no-store',signal,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(input)});
  if(!response.ok){const result=await response.json().catch(()=>({}));throw new ApiError(response.status,result.error||'Не удалось открыть вложение.');}
  const limit=input.variant==='preview'?MEDIA_LIMITS.previewBytes:MEDIA_LIMITS.fileBytes;
  if(Number(response.headers.get('content-length')||0)>limit)throw new Error('Вложение превышает 32 МБ.');
  const blob=await response.blob();if(blob.size>limit)throw new Error('Вложение превышает 32 МБ.');
  const raw=response.headers.get('x-attachment-kind');const kind:Attachment['kind']=raw==='image'||raw==='audio'||raw==='video'?raw:'file';
  let name='Файл';try{name=decodeURIComponent(response.headers.get('x-attachment-name')||'Файл');}catch{/* Неполный заголовок не становится URL или HTML. */}
  return {blob,attachment:{id:input.attachmentId,kind,name,mimeType:blob.type,size:blob.size,downloadable:true}};
}

//: Получает фото только выбранного диалога через same-origin chat API.
//: Не принимает внешний URL; 404 оставляет инициалы вместо фотографии.
export async function avatarData(conversationId:string,signal:AbortSignal,refresh=false):Promise<Blob>{
  const controller=new AbortController();
  //: Передаёт отмену владельца отдельному дедлайну HTTP-запроса фото.
  //: Таймер не меняет общую сессию или запросы других изображений.
  const abort=()=>controller.abort();if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,20000);
  try{
    const response=await fetch(`${appApiBase}/chat/avatar`,{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({conversationId,...(refresh?{refresh:true}:{})})});
    if(!response.ok){const result=await response.json().catch(()=>({}));throw new ApiError(response.status,result.error||'Фото недоступно.');}
    const blob=await response.blob();if(!['image/jpeg','image/png','image/webp'].includes(blob.type)||blob.size>MEDIA_LIMITS.previewBytes)throw new ApiError(415,'Фото недоступно.');return blob;
  }catch(error){if(controller.signal.aborted&&!signal.aborted)throw new ApiError(408,'Истекло время загрузки фото.');throw error;}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
