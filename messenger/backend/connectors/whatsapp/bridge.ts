import {createConnection} from 'node:net';
import type {BrowserRequest,BrowserResult} from './protocol.js';
//: Отправляет одну фиксированную команду через приватный Unix socket.
//: Нет TCP-порта, токена в браузере, универсального RPC или бесконечного ожидания.
export function browserCall(request:BrowserRequest,socketPath=process.env.WHATSAPP_BROWSER_SOCKET||'/run/zai-whatsapp/control.sock'):Promise<BrowserResult>{
  return new Promise((resolve,reject)=>{
    const socket=createConnection(socketPath);const chunks:Buffer[]=[];let size=0;let done=false;
    const timer=setTimeout(()=>finish(new Error('browser_timeout')),20000);
    //: Закрывает единственный запрос и удаляет таймер.
    //: Ответ после таймаута никогда не передаётся вызывающему коду.
    function finish(error?:Error,value?:BrowserResult){if(done)return;done=true;clearTimeout(timer);socket.destroy();if(error)reject(error);else resolve(value!);}
    socket.on('connect',()=>socket.end(JSON.stringify(request)+'\n'));
    socket.on('error',()=>finish(new Error('browser_unavailable')));
    socket.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024)return finish(new Error('browser_response_limit'));chunks.push(chunk);});
    socket.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString()) as BrowserResult;if(value.error)finish(new Error(value.error));else finish(undefined,value);}catch{finish(new Error('browser_response_invalid'));}});
  });
}
