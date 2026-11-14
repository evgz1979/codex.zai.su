import {constants} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import type {AttachmentService} from './core/attachments.js';
import type {PushService} from './core/push.js';
import {MEDIA_LIMITS,messengerPageBase,type AttachmentRequest} from '../shared/types.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile,open as openFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { Auth, AuthError, type Role } from './auth/auth.js';
import { AppError, type MessengerService } from './core/service.js';
import type { Store } from './storage/store.js';
import type { AdminService } from './admin/service.js';
import type { SendRequest } from '../shared/types.js';
import type {Accounts} from './accounts.js';
//: Создаёт раздельные API чата и админки с серверной проверкой ролей.
//: Публичная версия требует HTTPS cookie и заранее настроенные Argon2id-пароли.
export function createApp(options: { service:MessengerService; store:Store; auth?:Auth; accounts?:Accounts; admin?:AdminService; attachments?:AttachmentService; push?:PushService; clientDirectory:string; origin:string; secureCookies?:boolean }) {
  const ownerAuth=options.auth||new Auth(options.store);
  const secure=options.secureCookies??options.origin.startsWith('https://');
  const root=resolve(options.clientDirectory);
  //: Передаёт только безопасный JSON-результат операции.
  //: Сырые исключения, секреты и тела запросов не сериализуются.
  function send(res:ServerResponse,status:number,value:unknown) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); }
  //: Читает JSON-объект с ограничением размера.
  //: Парсинг не пишет тела запросов в журнал или хранилище.
  async function readBody(req:IncomingMessage,limit=20000):Promise<Record<string,unknown>> {
    if(req.headers['content-type']?.split(';')[0]!=='application/json') throw new AppError(415,'Ожидается JSON.');
    const chunks:Buffer[]=[]; let size=0;
    for await(const chunk of req) { size+=chunk.length; if(size>limit) throw new AppError(413,'Запрос слишком большой.'); chunks.push(chunk); }
    try { const value=JSON.parse(Buffer.concat(chunks).toString()); if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error(); return value; }
    catch { throw new AppError(400,'Некорректный запрос.'); }
  }
  //: Устанавливает cookie для единственной роли.
  //: Использует HttpOnly, Strict, ограниченный Path и Secure в HTTPS.
  function cookie(res:ServerResponse,role:Role,token:string,maxAge:number,prefix:string) { res.setHeader('Set-Cookie',`${ownerAuth.cookieName(role,secure)}=${token}; HttpOnly; SameSite=Strict; Path=${prefix}/${role}; Max-Age=${maxAge}${secure?'; Secure':''}`); }
  const server=createServer(async(req,res)=> {
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
    if(secure) res.setHeader('Strict-Transport-Security','max-age=31536000');
    try {
      if(req.headers.host!==new URL(options.origin).host) throw new AppError(403,'Недопустимый адрес сервера.');
      if(!['GET','POST'].includes(req.method||'')) throw new AppError(405,'Метод недоступен.');
      const originalPath=new URL(req.url||'/',options.origin).pathname;
      const personalApi=/^\/api\/u\/([a-z][a-z0-9_-]{1,31})(\/.*)?$/.exec(originalPath);
      const pagePrefix=personalApi?`/u/${personalApi[1]}`:messengerPageBase(originalPath);
      const username=personalApi?.[1]||pagePrefix.split('/').pop();
      const personal=!!pagePrefix;
      const account=personal?options.accounts?.find(username!):options.accounts?.owner;
      if(personal&&!account)throw new AppError(404,'Пользователь не найден или доступ отключён.');
      const current=account?.runtime||options;
      const auth=current.auth||ownerAuth;
      const accountInfo=account?{id:account.info.id,username:account.info.username,displayName:account.info.displayName,isOwner:account.info.isOwner,path:account.info.path||(account.info.isOwner?'/':`/u/${account.info.username}/`)}:undefined;
      const apiPrefix=personal?`/api/u/${username}`:'/api';
      const path=personalApi?`/api${personalApi[2]||'/'}`:personal?originalPath.slice(pagePrefix.length)||'/':originalPath;
      if(personal&&!personalApi&&!['/','/admin','/admin/','/sw.js','/manifest.webmanifest'].includes(path))throw new AppError(404,'Адрес не найден.');
      if(req.method==='POST'&&req.headers.origin!==options.origin) throw new AppError(403,'Недопустимый источник запроса.');
      if(path==='/healthz'&&req.method==='GET'&&!personal) return send(res,auth.ready()?200:503,{status:auth.ready()?'ok':'locked'});
      if(path.startsWith('/api/')) {
        const role:Role=path.startsWith('/api/admin/')?'admin':'chat';
        const prefix=`/api/${role}/`;
        if(!path.startsWith(prefix)) throw new AppError(404,'Адрес не найден.');
        const action=path.slice(prefix.length);
        const session=action==='session'&&req.method==='GET'?auth.renew(req.headers.cookie,role,secure):auth.session(req.headers.cookie,role,secure);
        //: Повторно проверяет доступ после получения тела защищённого запроса.
        //: Блокировка во время медленной загрузки тела не запускает операцию личного источника.
        async function body(request:IncomingMessage,limit=20000){const input=await readBody(request,limit);if(action!=='login'&&(!auth.session(request.headers.cookie,role,secure)||(account&&!options.accounts!.allows(account))))throw new AppError(401,'Войдите в приложение.');return input;}
        if(action==='session'&&req.method==='GET') {
          if(session&&role==='chat')cookie(res,role,auth.token(req.headers.cookie||'',role,secure),Math.max(0,Math.floor((session.expires-Date.now())/1000)),apiPrefix);
          return send(res,200,{authenticated:!!session,setupRequired:auth.setupRequired,...(accountInfo?{account:accountInfo}:{}),...(session?{csrfToken:session.csrf,expiresAt:session.expires}:{})});
        }
        if(action==='login'&&req.method==='POST') {
          const input=await body(req);
          if(typeof input.password!=='string'||input.password.length>512) throw new AppError(400,'Введите пароль.');
          const login=account?await options.accounts!.login(account,input.password,role):await auth.login(input.password,role); auth.logout(req.headers.cookie,role,secure); cookie(res,role,login.token,Math.max(0,Math.floor((login.expires-Date.now())/1000)),apiPrefix);
          return send(res,200,{authenticated:true,setupRequired:false,csrfToken:login.csrf,expiresAt:login.expires,...(accountInfo?{account:accountInfo}:{})});
        }
        if(!session) throw new AppError(401,'Войдите в приложение.');
        if(req.method==='POST'&&req.headers['x-csrf-token']!==session.csrf) throw new AppError(403,'Обновите страницу и повторите вход.');
        if(action==='logout'&&req.method==='POST') {if(role==='chat'&&current.push){const input=await body(req);if(input.pushEndpoint!==undefined)current.push.remove(input.pushEndpoint);}auth.logout(req.headers.cookie,role,secure); cookie(res,role,'',0,apiPrefix); return send(res,200,{ok:true}); }
        if(role==='chat') {
          if(action==='badge'&&req.method==='GET')return send(res,200,{count:current.store.badgeCount()});
          if(action==='push/config'&&req.method==='GET') {if(!current.push)throw new AppError(503,'Уведомления недоступны.');return send(res,200,current.push.configuration());}
          if((action==='push/status'||action==='push/subscribe'||action==='push/remove'||action==='push/test')&&req.method==='POST') {
            const push=current.push;if(!push)throw new AppError(503,'Уведомления недоступны.');const input=await body(req);
            if(action==='push/status')return send(res,200,{enabled:push.registered(input.endpoint)});
            if(action==='push/test'){await push.test(input.endpoint);return send(res,200,{ok:true});}
            if(action==='push/subscribe')push.subscribe(input.subscription);else push.remove(input.endpoint);
            return send(res,200,{ok:true});
          }
          if(action==='access'&&req.method==='GET') {const since=Number(new URL(req.url||'/',options.origin).searchParams.get('since')||0);if(!Number.isSafeInteger(since)||since<0)throw new AppError(400,'Некорректная ревизия.');return send(res,200,current.store.access(since));}
          if(action==='snapshot'&&req.method==='GET') return send(res,200,current.service.snapshot());
          if(action==='pin'&&req.method==='POST') {
            const input = await body(req);
            return send(res, 200, current.service.setConversationPin(input.conversationId, input.pinned));
          }
          if(action==='offline'&&req.method==='POST'){const input=await body(req);return send(res,200,current.service.offlineBatch(input.conversationIds));}
          if(action==='transcribe'&&req.method==='POST'){
            const input=await body(req) as unknown as AttachmentRequest;
            const result=await current.service.transcriptions.request(input);
            if(!auth.session(req.headers.cookie,'chat',secure)||(account&&!options.accounts!.allows(account)))throw new AppError(401,'Войдите в приложение.');
            current.service.attachmentMessage(input);
            return send(res,200,result);
          }
          if(action==='inbox'&&req.method==='POST'){const input=await body(req);if(input.before!==undefined&&(typeof input.before!=='string'||!input.before||input.before.length>2048))throw new AppError(400,'Некорректный курсор кеша.');return send(res,200,current.service.inboxPage(input.before as string|undefined));}
          if(action==='refresh'&&req.method==='POST') return send(res,200,await current.service.refresh());
          if((action==='open'||action==='older'||action==='read')&&req.method==='POST') {
            const input=await body(req); if(typeof input.conversationId!=='string') throw new AppError(400,'Выберите диалог.');
            if(action==='older'&&(typeof input.before!=='string'||!input.before||input.before.length>2048))throw new AppError(400,'Некорректный курсор сообщений.');
            if(action==='read'&&input.messageId!==undefined&&(typeof input.messageId!=='string'||!input.messageId||input.messageId.length>2048))throw new AppError(400,'Некорректная позиция просмотра.');
            return send(res,200,await (action==='read'?current.service.markRead(input.conversationId,input.messageId as string|undefined):current.service.open(input.conversationId,action==='older'?input.before as string:undefined)));
          }
          if(action==='avatar'&&req.method==='POST'){
            const input=await body(req);if(typeof input.conversationId!=='string'||(input.refresh!==undefined&&typeof input.refresh!=='boolean'))throw new AppError(400,'Некорректный запрос фото.');
            const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
            //: Отменяет загрузку фото при закрытии HTTP-ответа.
            //: Перед отправкой повторно проверяются роль, блокировка аккаунта и выбранность.
            const abort=()=>controller.abort();res.once('close',abort);
            try{
              const image=await current.service.avatar(input.conversationId,controller.signal,input.refresh===true);controller.signal.throwIfAborted();
              if(!auth.session(req.headers.cookie,'chat',secure)||(account&&!options.accounts!.allows(account)))throw new AppError(401,'Войдите в приложение.');
              current.service.selection.require(input.conversationId);
              res.writeHead(200,{'Content-Type':image.mimeType,'Content-Length':image.bytes.length});res.end(image.bytes);return;
            }finally{clearTimeout(timer);res.removeListener('close',abort);}
          }
          if(action==='attachment'&&req.method==='POST'){
            const input=await body(req);const attachments=current.attachments;if(!attachments)throw new AppError(503,'Просмотр вложений недоступен.');
            const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),MEDIA_LIMITS.timeoutMs);
            //: Прерывает сетевую загрузку при закрытии HTTP-ответа.
            //: Не оставляет фонового копирования после ухода пользователя.
            const abort=()=>{controller.abort();};res.once('close',abort);
            let entry:Awaited<ReturnType<AttachmentService['open']>>|undefined;
            try{
              //: Повторно проверяет текущую chat-сессию для потока вложения.
              //: Отзыв роли не даёт закончить начатое чтение кеша.
              const authorize=()=>{if(!auth.session(req.headers.cookie,'chat',secure)||(account&&!options.accounts!.allows(account)))throw new AppError(401,'Войдите в приложение.');};
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
          if(action==='send'&&req.method==='POST') return send(res,200,await current.service.send(await body(req) as unknown as SendRequest));
        } else {
          if(action==='users'||action==='users/create'||action==='users/access'){
            if(!options.accounts||!account?.info.isOwner)throw new AppError(403,'Пользователями управляет только владелец.');
            if(action==='users'&&req.method==='GET')return send(res,200,{users:options.accounts.list()});
            if(action==='users/create'&&req.method==='POST')return send(res,200,{user:await options.accounts.create(await body(req))});
            if(action==='users/access'&&req.method==='POST'){const input=await body(req);await options.accounts.setEnabled(input.id,input.enabled);return send(res,200,{ok:true});}
            throw new AppError(405,'Метод недоступен.');
          }
          const admin=current.admin; if(!admin) throw new AppError(503,'Админка недоступна.');
          if(action==='status'&&req.method==='GET') return send(res,200,admin.status());
          if(action.startsWith('whatsapp/')&&options.accounts&&!account?.info.isOwner)throw new AppError(403,'Тестирование WhatsApp пока доступно только владельцу.');
          if(action==='whatsapp/status'&&req.method==='GET'){if(!admin.whatsapp)throw new AppError(503,'WhatsApp недоступен.');const result=await admin.whatsapp.authStatus();if(!auth.session(req.headers.cookie,'admin',secure)||(account&&!options.accounts!.allows(account)))throw new AppError(401,'Войдите в приложение.');return send(res,200,result);}
          if(action==='whatsapp/begin'&&req.method==='POST'){await body(req);if(!admin.whatsapp)throw new AppError(503,'WhatsApp недоступен.');const result=await admin.whatsapp.begin();if(!auth.session(req.headers.cookie,'admin',secure)||(account&&!options.accounts!.allows(account)))throw new AppError(401,'Войдите в приложение.');return send(res,200,result);}
          if(action==='whatsapp/disconnect'&&req.method==='POST'){await body(req);await admin.disconnectWhatsApp();return send(res,200,{ok:true});}
          if(action==='whatsapp/dialogs'&&req.method==='GET')return send(res,200,await admin.whatsappDialogs());
          if(action==='whatsapp/selection'&&req.method==='POST'){const input=await body(req,200000);if(!Array.isArray(input.ids)||input.ids.some(id=>typeof id!=='string'))throw new AppError(400,'Проверьте выбор диалогов.');return send(res,200,{selectedIds:admin.selectWhatsApp(input.ids)});}
          if(action==='dialogs'&&req.method==='GET') return send(res,200,await admin.dialogs());
          if(action==='selection'&&req.method==='POST') { const input=await body(req,200000); if(!Array.isArray(input.ids)||input.ids.some(id=>typeof id!=='string')) throw new AppError(400,'Проверьте выбор диалогов.'); return send(res,200,{selectedIds:admin.select(input.ids)}); }
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
            await admin.changePassword(input.role,input.password); auth.revoke(input.role); if(input.role==='chat')current.push?.clear();return send(res,200,{ok:true});
          }
        }
        throw new AppError(404,'Адрес не найден.');
      }
      if(req.method!=='GET') throw new AppError(405,'Метод недоступен.');
      if(personal&&!personalApi&&originalPath===pagePrefix){res.writeHead(308,{Location:`${pagePrefix}/`});return res.end();}
      const asset=path==='/'||path==='/admin'||path==='/admin/'?'/index.html':decodeURIComponent(path);
      if(!['/version.json','/index.html','/favicon.svg','/manifest.webmanifest','/sw.js','/icon-192.png','/icon-512.png','/apple-touch-icon.png'].includes(asset)&&!/^\/assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(asset)) throw new AppError(404,'Файл не найден.');
      const file=resolve(root,`.${asset}`); if(!file.startsWith(root+sep)) throw new AppError(404,'Файл не найден.');
      let bytes:Buffer; try{bytes=await readFile(file);}catch{throw new AppError(404,'Файл не найден.');}
      if(personal&&asset==='/index.html'){
        const name=account!.info.displayName.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
        bytes=Buffer.from(bytes.toString().replace('href="/manifest.webmanifest"',`href="${pagePrefix}/manifest.webmanifest"`).replace('name="apple-mobile-web-app-title" content="Z AI Messenger"',`name="apple-mobile-web-app-title" content="${name}"`).replace('<title>Z AI Messenger</title>',`<title>${name} · Z AI Messenger</title>`));
      }
      if(personal&&asset==='/manifest.webmanifest'){
        const manifest=JSON.parse(bytes.toString());manifest.id=`${pagePrefix}/`;manifest.start_url=`${pagePrefix}/`;manifest.scope=`${pagePrefix}/`;manifest.name=`Z AI Messenger · ${account!.info.displayName}`;manifest.short_name=account!.info.displayName;bytes=Buffer.from(JSON.stringify(manifest));
      }
      const mime:Record<string,string>={'.json':'application/json; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
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
