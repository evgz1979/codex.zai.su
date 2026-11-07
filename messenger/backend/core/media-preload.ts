import type {Store} from '../storage/store.js';
import type {AttachmentService} from './attachments.js';
import {AppError} from './errors.js';
import {MEDIA_LIMITS,type AttachmentRequest} from '../../shared/types.js';
//: Готовит миниатюры и оригиналы выбранных чатов за последние пять дней.
//: Выполненные задания сохраняются в SQLite, интерактивный запрос прерывает фон.
export class MediaPreloadService {
  private timer?:ReturnType<typeof setTimeout>;
  private controller?:AbortController;
  private running?:Promise<void>;
  private stopped=false;
  private pruneAt=0;
  private round=0;
  //: Связывает существующий дисковый кеш с постоянной очередью SQLite.
  //: Подменяемые часы используются только синтетическими тестами.
  constructor(private store:Store,private media:AttachmentService,private now=Date.now){media.interruptPreload=()=>this.controller?.abort();}
  //: Запускает один последовательный фоновый поток без нового сервиса.
  //: Таймер не удерживает процесс после остановки основного приложения.
  start(){this.schedule(2000);}
  //: Планирует следующую ограниченную загрузку.
  //: Параллельных обходов истории вложений не создаётся.
  private schedule(delay=3000){if(this.stopped||this.timer)return;this.timer=setTimeout(()=>{this.timer=undefined;void this.tick().finally(()=>this.schedule());},delay);this.timer.unref();}
  //: Обрабатывает одно задание с общими ограничениями медиа.
  //: Сбой не пишет исключение провайдера и не останавливает текстовую синхронизацию.
  tick(){if(this.running)return this.running;this.running=this.runOnce().catch(()=>{}).finally(()=>{this.running=undefined;});return this.running;}
  //: Сначала готовит доступные миниатюры, затем чередует их с оригиналами.
  //: Устаревшие и невыбранные сообщения не запрашиваются у источника.
  private async runOnce(){
    if(this.stopped||!this.media.canPreload())return;
    const now=this.now();if(now<Number(this.store.get('media.pausedUntil')||0)||now<Number(this.store.get('sync.pausedUntil')||0))return;const since=new Date(now-MEDIA_LIMITS.preloadDays*86400000).toISOString();if(now>=this.pruneAt){this.store.pruneMediaJobs(since);this.pruneAt=now+3600000;}
    const preview=this.round++%2===0;let jobs=this.store.mediaJobs(since,now,preview);let variant=preview;if(!jobs.length){variant=!preview;jobs=this.store.mediaJobs(since,now,variant);}
    for(const {message,attachment} of jobs){
      const input:AttachmentRequest={conversationId:message.conversationId,messageId:message.id,attachmentId:attachment.id,...(variant?{variant:'preview' as const}:{})};
      if((variant&&attachment.hasPreview===false)||(!variant&&attachment.size!==undefined&&attachment.size>MEDIA_LIMITS.fileBytes)){this.store.finishMediaJob(input,message);continue;}
      this.controller=new AbortController();let timedOut=false;const timer=setTimeout(()=>{timedOut=true;this.controller?.abort();},MEDIA_LIMITS.timeoutMs);
      try{const entry=await this.media.open(input,this.controller.signal,()=>{},true);entry.release();this.store.finishMediaJob(input,message);}
      catch(error){if(!this.controller.signal.aborted||timedOut){const permanent=error instanceof AppError&&[404,413,415].includes(error.status);const retry=now+Math.max(60,error instanceof AppError?error.retryAfterSeconds||0:0)*1000;if(error instanceof AppError&&error.retryAfterSeconds)this.store.set('media.pausedUntil',String(retry));this.store.finishMediaJob(input,message,permanent?0:retry);}}
      finally{clearTimeout(timer);this.controller=undefined;}return;
    }
  }
  //: Прерывает текущую загрузку и ждёт удаления частичного файла.
  //: Завершённые отметки и кеш остаются для следующего запуска.
  async stop(){this.stopped=true;clearTimeout(this.timer);this.controller?.abort();await this.running;}
}
