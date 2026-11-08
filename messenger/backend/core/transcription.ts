import type {AttachmentRequest,Message,VoiceTranscription} from '../../shared/types.js';
import type {Store} from '../storage/store.js';
import type {MessengerService} from './service.js';
import type {SourceEvent,SourceTranscription} from './source-adapter.js';
import {AppError} from './errors.js';
//: Управляет явными запросами встроенной расшифровки выбранного источника.
//: Не скачивает аудио и не передаёт сообщения внешним ИИ; кеш изолирован Store аккаунта.
export class VoiceTranscriptionService {
  private pending=new Map<string,Promise<VoiceTranscription>>();
  //: Подключает проверки маршрута ядра и приватное хранилище аккаунта.
  //: Одновременно выполняются не более двух разных запросов источника.
  constructor(private core:MessengerService,private store:Store){}
  //: Проверяет выбранное сохранённое голосовое до любого обращения к источнику.
  //: Миниатюры, обычное аудио, временные и чужие вложения не расшифровываются.
  private message(input:AttachmentRequest):Message{
    const message=this.core.attachmentMessage(input);
    const attachment=message.attachments.find(a=>a.id===input.attachmentId)!;
    if(input.variant!==undefined||attachment.kind!=='audio'||!attachment.isVoice||attachment.downloadable===false)throw new AppError(415,'Расшифровка доступна только для голосовых сообщений.');
    return message;
  }
  //: Проверяет форму результата перед сохранением текста провайдера.
  //: Native ID используется только для сопоставления обновлений одного задания.
  private valid(result:SourceTranscription){return !!result&&typeof result.text==='string'&&result.text.length<=100000&&typeof result.pending==='boolean'&&typeof result.transcriptionId==='string'&&/^-?\d{1,20}$/.test(result.transcriptionId);}
  //: Возвращает готовый кеш или запускает один дедуплицированный запрос.
  //: Pending перечитывается у источника не чаще раза в 30 секунд, включая рестарт.
  async request(input:AttachmentRequest):Promise<VoiceTranscription>{
    const original=this.message(input);const version=original.editedAt||original.date;
    const saved=this.store.transcription(original.id);
    if(saved?.version===version&&saved.attachmentId===input.attachmentId&&(!saved.pending||Date.now()-saved.updatedAt<30000))return {text:saved.text,pending:saved.pending};
    const key=JSON.stringify([original.id,input.attachmentId,version]);let operation=this.pending.get(key);
    if(!operation){
      if(this.pending.size>=2)throw new AppError(429,'Дождитесь завершения других расшифровок.');
      const adapter=this.core.registry.get(original.sourceId);if(!adapter.transcribeVoice)throw new AppError(415,'Источник не поддерживает расшифровку.');
      operation=Promise.resolve().then(async()=>{
        this.message(input);
        let result:SourceTranscription;
        try{result=await adapter.transcribeVoice!(input);}catch(error){if(error instanceof AppError)throw error;throw new AppError(503,'Не удалось расшифровать голосовое сообщение. Повторите позже.');}
        const current=this.message(input);if((current.editedAt||current.date)!==version)throw new AppError(409,'Голосовое сообщение изменилось.');
        if(!this.valid(result))throw new AppError(503,'Не удалось получить расшифровку.');
        this.store.saveTranscription(current,input.attachmentId,result);
        return this.store.message(current.id)!.voiceTranscription!;
      }).finally(()=>this.pending.delete(key));
      this.pending.set(key,operation);
    }
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new AppError(504,'Telegram долго отвечает. Повторите попытку позже.')),25000);})]);}
    finally{clearTimeout(timer);}
  }
  //: Принимает обновления только ранее запрошенного задания той же версии.
  //: Чужой ID, исключённый диалог, удаление или завершённый результат не заменяются.
  ingest(event:Extract<SourceEvent,{type:'transcription'}>){
    if(!this.valid(event.result)||!this.core.selection.allows(event.request.conversationId))return;
    let message:Message;try{message=this.message(event.request);}catch{return;}
    if(message.sourceId!==event.sourceId)return;
    const saved=this.store.transcription(message.id);
    if(!saved||saved.version!==(message.editedAt||message.date)||saved.attachmentId!==event.request.attachmentId||saved.transcriptionId!==event.result.transcriptionId||!saved.pending)return;
    this.store.saveTranscription(message,event.request.attachmentId,event.result);
  }
}
