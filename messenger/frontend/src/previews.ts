import type {AttachmentRequest} from '../../shared/types';
import {attachmentData,ApiError} from './api';
const cache=new Map<string,Awaited<ReturnType<typeof attachmentData>>>();
let queue:Promise<unknown>=Promise.resolve();
//: Удаляет только оперативные миниатюры при выходе или смене разрешений.
//: Постоянных записей в хранилище браузера нет, Blob URL принадлежат компонентам.
export function clearPreviews(){cache.clear();}
//: Последовательно получает маленькие изображения и повторно использует до 32 Blob.
//: Отмена снимает ожидающую работу; оригиналы здесь никогда не запрашиваются.
export function previewData(input:AttachmentRequest,version:string,signal:AbortSignal){
  const key=JSON.stringify([input.conversationId,input.messageId,input.attachmentId,version]);
  const task=queue.then(async()=>{
    signal.throwIfAborted();const old=cache.get(key);if(old){cache.delete(key);cache.set(key,old);return old;}
    let result:Awaited<ReturnType<typeof attachmentData>>|undefined;
    for(let attempt=0;attempt<2;attempt++){
      try{result=await attachmentData({...input,variant:'preview'},signal);break;}catch(error){if(signal.aborted||attempt||!(error instanceof ApiError)||![408,429,503].includes(error.status))throw error;await new Promise<void>(resolve=>setTimeout(resolve,1000));signal.throwIfAborted();}
    }
    if(!result||result.attachment.kind!=='image')throw new ApiError(415,'Миниатюра недоступна.');
    signal.throwIfAborted();cache.set(key,result);while(cache.size>32)cache.delete(cache.keys().next().value!);return result;
  });
  queue=task.catch(()=>{});return task;
}
