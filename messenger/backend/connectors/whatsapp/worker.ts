import {createServer} from 'node:net';
import {chmodSync,existsSync,unlinkSync,realpathSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {browserRequest,type BrowserResult} from './protocol.js';
import {WhatsAppBrowser} from './browser.js';
//: Обслуживает закрытый Unix socket с фиксированным протоколом WhatsApp.
//: Все браузерные операции последовательны; зависший вызов завершает worker для очистки cgroup.
export function createBrowserWorker(browser:Pick<WhatsAppBrowser,'handle'|'stop'>){
  let queue=Promise.resolve();let clients=0;
  return createServer({allowHalfOpen:true},socket=>{
    if(++clients>16){clients--;socket.destroy();return;}socket.once('close',()=>clients--);socket.on('error',()=>{});socket.setTimeout(25000,()=>socket.destroy());
    const chunks:Buffer[]=[];let size=0;
    socket.on('data',chunk=>{size+=chunk.length;if(size>300000)socket.destroy();else chunks.push(chunk);});
    socket.on('end',()=>{
      queue=queue.then(async()=>{
        if(socket.destroyed)return;let result:BrowserResult;let action='invalid';
        try{
          const request=browserRequest(JSON.parse(Buffer.concat(chunks).toString()));
          action=request.action;
          const timer=setTimeout(()=>{process.stderr.write(`WhatsApp worker: command_timeout:${request.action}\n`);process.exit(1);},30000);timer.unref();
          try{result=await browser.handle(request);}finally{clearTimeout(timer);}
        }catch(error){const code=error instanceof Error?error.message:'';const known=['invalid_request','not_selected','invalid_destination','invalid_cursor','browser_busy','browser_not_ready','message_destination_mismatch','history_pending','history_timeout','read_position_changed'];const shape=/^history_shape:(\d{1,8}):(\d{1,8}):(\d{1,8})$/.exec(code);if(shape){process.stderr.write(`WhatsApp worker: history_shape:models=${shape[1]}:keys=${shape[2]}:dates=${shape[3]}\n`);}else if(!known.includes(code)){const type=error instanceof Error&&['Error','TypeError','ReferenceError','RangeError','TimeoutError','ProtocolError'].includes(error.name)?error.name:'unknown';const field=/reading ['"]([a-zA-Z]+)['"]/.exec(code)?.[1];const safeField=field&&['id','msgs','serialize','getModelsArray','fromMe','remote','getChat','getChatModel'].includes(field)?field:'unknown';process.stderr.write(`WhatsApp worker: operation_failed:${action}:${type}:${safeField}\n`);}result={error:shape?'history_pending':known.includes(code)?code:'browser_operation_failed'};}
        const bytes=JSON.stringify(result);socket.end(bytes.length<=2*1024*1024?bytes:JSON.stringify({error:'browser_response_limit'}));
      }).catch(()=>{socket.destroy();});
    });
  });
}
//: Запускает непривилегированный браузерный worker без TCP-listener.
//: Сессии находятся вне релизов; SIGTERM закрывает браузер и приватный socket.
function main(){
  process.umask(0o077);
  //: Записывает только тип фатальной ошибки без сообщения, стека, QR или аргументов.
  //: Закрытый список различает сбой библиотеки и watchdog, сохраняя приватность аккаунта.
  const fatal=(kind:string,error:unknown)=>{const name=error instanceof Error&&['Error','TypeError','ReferenceError','TimeoutError','ProtocolError','TargetCloseError','RangeError','SyntaxError'].includes(error.name)?error.name:'unknown';process.stderr.write(`WhatsApp worker: ${kind}:${name}\n`);process.exit(1);};
  process.on('uncaughtException',error=>fatal('uncaught_exception',error));process.on('unhandledRejection',error=>fatal('unhandled_rejection',error));
  const socket=process.env.WHATSAPP_BROWSER_SOCKET||'/run/zai-whatsapp/control.sock';
  const browser=new WhatsAppBrowser(process.env.WHATSAPP_BROWSER_DATA||'/var/lib/zai-whatsapp',process.env.WHATSAPP_CHROME_PATH||'/opt/google/chrome/chrome');
  if(existsSync(socket))unlinkSync(socket);const server=createBrowserWorker(browser);server.listen(socket,()=>chmodSync(socket,0o660));
  //: Завершает только браузерный сервис по сигналу systemd.
  //: Профили сохраняются, чужие сервисы и сетевые настройки не меняются.
  const stop=()=>{server.close();void browser.stop().finally(()=>process.exit(0));};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href)main();
