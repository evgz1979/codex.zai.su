// Изолированный сервер только для браузерных тестов: временная БД и синтетические сообщения.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {AttachmentService} from '../backend/core/attachments.js';
import {entityId} from '../shared/types.js';
import { Store } from '../backend/storage/store.js';
import { passwordHash } from '../backend/auth/auth.js';
import { MessengerService } from '../backend/core/service.js';
import { createApp } from '../backend/http.js';
import { clientDirectory } from '../backend/config.js';
import { TestAdapter } from './fixtures.js';
const dir = mkdtempSync(join(tmpdir(),'zai-messenger-browser-'));
const store = new Store(dir);
store.set('auth.chat',await passwordHash('browser-test-password'));
store.set('auth.admin',await passwordHash('browser-admin-password'));
const a = new TestAdapter('fixture-a','Telegram');
const b = new TestAdapter('fixture-b','Другой источник · тест');
b.conversations = b.conversations.slice(0,1); b.conversations[0].title = 'Мария · другой источник';
b.messages = b.messages.slice(0,1); b.messages[0].text = 'Это синтетическое сообщение из другого источника.';
b.messages[0].date = '2026-11-07T10:01:30.000Z';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const wave=Buffer.alloc(8044);wave.write('RIFF',0);wave.writeUInt32LE(8036,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(8000,24);wave.writeUInt32LE(8000,28);wave.writeUInt16LE(1,32);wave.writeUInt16LE(8,34);wave.write('data',36);wave.writeUInt32LE(8000,40);wave.fill(128,44);
for(const [name,kind,mimeType,bytes] of [['Тестовое фото.png','image','image/png',png],['Документ.txt','file','application/octet-stream',Buffer.from('Синтетический файл')],['Аудио.wav','audio','audio/wav',wave],['Видео.mp4','video','video/mp4',Buffer.from('Synthetic unsupported video')]] as const){const attachment={id:entityId(a.source.id,'attachment',name),name,kind,mimeType,size:bytes.length,downloadable:true};a.messages[0].attachments.push(attachment);a.media.set(attachment.id,{attachment,bytes});}
for(const value of a.media.values())if(value.attachment.kind==='video')a.previews.set(value.attachment.id,{attachment:{...value.attachment,kind:'image',mimeType:'image/png',size:png.length},bytes:png});
const pdfBytes=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF');const pdf={id:entityId(a.source.id,'attachment','PDF'),name:'Документ.pdf',kind:'file' as const,mimeType:'application/pdf',size:pdfBytes.length,downloadable:true,hasPreview:false};a.messages[0].attachments.push(pdf);a.media.set(pdf.id,{attachment:pdf,bytes:pdfBytes});
store.select([...a.conversations,...b.conversations].map(c=>c.id));
const service = new MessengerService([a,b],store); await service.refresh();
store.upsertMessages([...a.messages,...b.messages]);
for(const conversation of [...a.conversations,...b.conversations])store.saveProgress(conversation.id,{...store.progress(conversation.id),initialized:true,historyComplete:true});
const attachments=new AttachmentService(service,dir);
const testPort=Number(process.env.MESSENGER_TEST_PORT||14318);
const server = createApp({ store,service,attachments,clientDirectory,origin:`http://127.0.0.1:${testPort}` });
server.listen(testPort,'127.0.0.1');
function stop() { server.closeAllConnections(); server.close(() => { store.close(); rmSync(dir,{recursive:true,force:true}); }); }
process.on('SIGTERM',stop); process.on('SIGINT',stop);
