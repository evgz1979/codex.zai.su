import {constants} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import type {AttachmentService} from './core/attachments.js';
import {MEDIA_LIMITS,type AttachmentRequest} from '../shared/types.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile,open as openFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { Auth, AuthError, type Role } from './auth/auth.js';
import { AppError, type MessengerService } from './core/service.js';
import type { Store } from './storage/store.js';
import type { AdminService } from './admin/service.js';
import type { SendRequest } from '../shared/types.js';
//: Создаёт раздельные API чата и админки с серверной проверкой ролей.
//: Публичная версия требует HTTPS cookie и заранее настроенные Argon2id-пароли.
export function createApp(options: { service:MessengerService; store:Store; admin?:AdminService; attachments?:AttachmentService; clientDirectory:string; origin:string; secureCookies?:boolean }) {
  const auth=new Auth(options.store);
  const secure=options.secureCookies??options.origin.startsWith('https://');
  const root=resolve(options.clientDirectory);
  //: Передаёт только безопасный JSON-результат операции.
  //: Сырые исключения, секреты и тела запросов не сериализуются.
  function send(res:ServerResponse,status:number,value:unknown) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); }
  //: Читает JSON-объект с ограничением размера.
  //: Парсинг не пишет тела запросов в журнал или хранилище.
  async function body(req:IncomingMessage):Promise<Record<string,unknown>> {
    if(req.headers['content-type']?.split(';')[0]!=='application/json') throw new AppError(415,'Ожидается JSON.');
    const chunks:Buffer[]=[]; let size=0;
    for await(const chunk of req) { size+=chunk.length; if(size>20000) throw new AppError(413,'Запрос слишком большой.'); chunks.push(chunk); }
    try { const value=JSON.parse(Buffer.concat(chunks).toString()); if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error(); return value; }
    catch { throw new AppError(400,'Некорректный запрос.'); }
  }
  //: Устанавливает cookie для единственной роли.
  //: Использует HttpOnly, Strict, ограниченный Path и Secure в HTTPS.
  function cookie(res:ServerResponse,role:Role,token:string,maxAge:number) { res.setHeader('Set-Cookie',`${auth.cookieName(role,secure)}=${token}; HttpOnly; SameSite=Strict; Path=/api/${role}; Max-Age=${maxAge}${secure?'; Secure':''}`); }
  const server=createServer(async(req,res)=> {
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
    if(secure) res.setHeader('Strict-Transport-Security','max-age=31536000');
    try {
      if(req.headers.host!==new URL(options.origin).host) throw new AppError(403,'Недопустимый адрес сервера.');
      if(!['GET','POST'].includes(req.method||'')) throw new AppError(405,'Метод недоступен.');
      const path=new URL(req.url||'/',options.origin).pathname;
      if(req.method==='POST'&&req.headers.origin!==options.origin) throw new AppError(403,'Недопустимый источник запроса.');
      if(path==='/healthz'&&req.method==='GET') return send(res,auth.ready()?200:503,{status:auth.ready()?'ok':'locked'});
      if(path.startsWith('/api/')) {
        const role:Role=path.startsWith('/api/admin/')?'admin':'chat';
        const prefix=`/api/${role}/`;
        if(!path.startsWith(prefix)) throw new AppError(404,'Адрес не найден.');
        const action=path.slice(prefix.length);
        const session=auth.session(req.headers.cookie,role,secure);
        if(action==='session'&&req.method==='GET') return send(res,200,{authenticated:!!session,setupRequired:auth.setupRequired,...(session?{csrfToken:session.csrf}:{})});
        if(action==='login'&&req.method==='POST') {
          const input=await body(req);
          if(typeof input.password!=='string'||input.password.length>512) throw new AppError(400,'Введите пароль.');
          const login=await auth.login(input.password,role); auth.logout(req.headers.cookie,role,secure); cookie(res,role,login.token,28800);
          return send(res,200,{authenticated:true,setupRequired:false,csrfToken:login.csrf});
        }
        if(!session) throw new AppError(401,'Войдите в приложение.');
        if(req.method==='POST'&&req.headers['x-csrf-token']!==session.csrf) throw new AppError(403,'Обновите страницу и повторите вход.');
        if(action==='logout'&&req.method==='POST') { auth.logout(req.headers.cookie,role,secure); cookie(res,role,'',0); return send(res,200,{ok:true}); }
        if(role==='chat') {
          if(action==='access'&&req.method==='GET') {const since=Number(new URL(req.url||'/',options.origin).searchParams.get('since')||0);if(!Number.isSafeInteger(since)||since<0)throw new AppError(400,'Некорректная ревизия.');return send(res,200,options.store.access(since));}
          if(action==='snapshot'&&req.method==='GET') return send(res,200,options.service.snapshot());
          if(action==='inbox'&&req.method==='POST'){const input=await body(req);if(input.before!==undefined&&(typeof input.before!=='string'||!input.before||input.before.length>2048))throw new AppError(400,'Некорректный курсор кеша.');return send(res,200,options.service.inboxPage(input.before as string|undefined));}
          if(action==='refresh'&&req.method==='POST') return send(res,200,await options.service.refresh());
          if((action==='open'||action==='older'||action==='read')&&req.method==='POST') {
            const input=await body(req); if(typeof input.conversationId!=='string') throw new AppError(400,'Выберите диалог.');
            if(action==='older'&&(typeof input.before!=='string'||!input.before||input.before.length>2048))throw new AppError(400,'Некорректный курсор сообщений.');
            return send(res,200,await (action==='read'?options.service.markRead(input.conversationId):options.service.open(input.conversationId,action==='older'?input.before as string:undefined)));
          }
          if(action==='attachment'&&req.method==='POST'){
            const input=await body(req);const attachments=options.attachments;if(!attachments)throw new AppError(503,'Просмотр вложений недоступен.');
            const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),MEDIA_LIMITS.timeoutMs);
            //: Прерывает сетевую загрузку при закрытии HTTP-ответа.
            //: Не оставляет фонового копирования после ухода пользователя.
            const abort=()=>{controller.abort();};res.once('close',abort);
            let entry:Awaited<ReturnType<AttachmentService['open']>>|undefined;
            try{
              //: Повторно проверяет текущую chat-сессию для потока вложения.
              //: Отзыв роли не даёт закончить начатое чтение кеша.
              const authorize=()=>{if(!auth.session(req.headers.cookie,'chat',secure))throw new AppError(401,'Войдите в приложение.');};
              entry=await attachments.open(input as unknown as AttachmentRequest,controller.signal,authorize);entry.assertAllowed();
              const a=entry.attachment;const name=encodeURIComponent(a.name).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16));
              res.writeHead(200,{'Content-Type':a.mimeType||'application/octet-stream','Content-Length':a.size!,'Content-Disposition':`attachment; filename*=UTF-8''${name}`,'X-Attachment-Kind':a.kind,'X-Attachment-Name':name});
              const guard=new Transform({
                //: Проверяет права перед каждой порцией HTTP-ответа.
                //: После начала ответа отказ закрывает соединение без раскрытия ошибки.
                transform(chunk,_encoding,callback){try{entry!.assertAllowed();callback(null,chunk);}catch{callback(new Error('Attachment access ended'));}}});
              const file=await openFile(entry.path,constants.O_RDONLY|constants.O_NOFOLLOW);await pipeline(file.createReadStream(),guard,res,{signal:controller.signal});return;
            }finally{clearTimeout(timer);res.removeListener('close',abort);entry?.release();}
          }
          if(action==='send'&&req.method==='POST') return send(res,200,await options.service.send(await body(req) as unknown as SendRequest));
        } else {
          const admin=options.admin; if(!admin) throw new AppError(503,'Админка недоступна.');
          if(action==='status'&&req.method==='GET') return send(res,200,admin.status());
          if(action==='dialogs'&&req.method==='GET') return send(res,200,await admin.dialogs());
          if(action==='selection'&&req.method==='POST') { const input=await body(req); if(!Array.isArray(input.ids)||input.ids.some(id=>typeof id!=='string')) throw new AppError(400,'Проверьте выбор диалогов.'); return send(res,200,{selectedIds:admin.select(input.ids)}); }
          if(action==='telegram/begin'&&req.method==='POST') {
            const input=await body(req);
            if(typeof input.apiId!=='number'||typeof input.apiHash!=='string'||typeof input.phone!=='string') throw new AppError(400,'Проверьте реквизиты Telegram.');
            return send(res,200,{stage:await admin.login.begin(input as {apiId:number;apiHash:string;phone:string})});
          }
          if((action==='telegram/code'||action==='telegram/password')&&req.method==='POST') {
            const input=await body(req); if(typeof input.value!=='string') throw new AppError(400,'Проверьте ввод.');
            return send(res,200,{stage:await admin.login.submit(action==='telegram/code'?'code':'password',input.value)});
          }
          if(action==='telegram/cancel'&&req.method==='POST') { await admin.login.cancel(); return send(res,200,{ok:true}); }
          if(action==='telegram/disconnect'&&req.method==='POST') { await admin.disconnect(); return send(res,200,{ok:true}); }
          if(action==='password'&&req.method==='POST') {
            const input=await body(req); if((input.role!=='admin'&&input.role!=='chat')||typeof input.password!=='string') throw new AppError(400,'Проверьте пароль.');
            await admin.changePassword(input.role,input.password); auth.revoke(input.role); return send(res,200,{ok:true});
          }
        }
        throw new AppError(404,'Адрес не найден.');
      }
      if(req.method!=='GET') throw new AppError(405,'Метод недоступен.');
      const asset=path==='/'||path==='/admin'||path==='/admin/'?'/index.html':decodeURIComponent(path);
      if(asset!=='/index.html'&&asset!=='/favicon.svg'&&!/^\/assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(asset)) throw new AppError(404,'Файл не найден.');
      const file=resolve(root,`.${asset}`); if(!file.startsWith(root+sep)) throw new AppError(404,'Файл не найден.');
      let bytes:Buffer; try{bytes=await readFile(file);}catch{throw new AppError(404,'Файл не найден.');}
      const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
      res.writeHead(200,{'Content-Type':mime[extname(file)]}); res.end(bytes);
    } catch(error) {
      if(res.headersSent) return res.destroy();
      if(error instanceof AppError||error instanceof AuthError) return send(res,error.status,{error:error.message});
      send(res,503,{error:'Операция недоступна. Проверьте подключение и повторите вручную.'});
    }
  });
  server.requestTimeout=15000; server.headersTimeout=10000; server.keepAliveTimeout=5000;
  return server;
}
