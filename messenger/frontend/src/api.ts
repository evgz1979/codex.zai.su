import {MEDIA_LIMITS,messengerPageBase,type Attachment,type AttachmentRequest} from '../../shared/types';
//: Выбирает путь личного Messenger из проверенного формата ссылки.
//: Имя не берётся из localStorage; API и настройки остаются в одном аккаунте.
export const appBase=messengerPageBase(location.pathname);
//: Сохраняет прежний API-префикс независимо от формы публичной ссылки.
//: Старые cookie остаются действительными при коротком адресе личной страницы.
export const appApiBase=appBase?`/api/u/${appBase.split('/').pop()}`:'/api';
let csrf = '';
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
export async function api<T>(path: string, input?: unknown, signal?:AbortSignal): Promise<T> {
  const res = await fetch(`${appApiBase}/${/^\/admin\/?$/.test(location.pathname.slice(appBase.length)) ? 'admin' : 'chat'}/${path}`, {
    method: input === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal,
    headers: input === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const result = await res.json();
  if (!res.ok) throw new ApiError(res.status, result.error || 'Операция не выполнена.');
  return result;
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
export async function avatarData(conversationId:string,signal:AbortSignal):Promise<Blob>{
  const controller=new AbortController();
  //: Передаёт отмену владельца отдельному дедлайну HTTP-запроса фото.
  //: Таймер не меняет общую сессию или запросы других изображений.
  const abort=()=>controller.abort();if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,20000);
  try{
    const response=await fetch(`${appApiBase}/chat/avatar`,{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({conversationId})});
    if(!response.ok){const result=await response.json().catch(()=>({}));throw new ApiError(response.status,result.error||'Фото недоступно.');}
    const blob=await response.blob();if(!['image/jpeg','image/png','image/webp'].includes(blob.type)||blob.size>MEDIA_LIMITS.previewBytes)throw new ApiError(415,'Фото недоступно.');return blob;
  }catch(error){if(controller.signal.aborted&&!signal.aborted)throw new ApiError(408,'Истекло время загрузки фото.');throw error;}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
