import {useEffect,useState} from 'react';
import type {AdminDialogCatalog,WhatsAppStatus} from '../../../shared/types';
import {api} from '../api';
import ConversationPicker from './ConversationPicker';
//: Показывает QR владельцу и неактивные инструкции остальным пользователям.
//: Неактивная панель не вызывает API; QR не попадает в локальный кеш или чат.
export default function WhatsAppPanel({onError,enabled}:{onError:(error:unknown)=>void;enabled:boolean}){
  const [status,setStatus]=useState<WhatsAppStatus>();const [busy,setBusy]=useState(false);const [catalog,setCatalog]=useState<AdminDialogCatalog>();const [selected,setSelected]=useState<string[]>([]);const [notice,setNotice]=useState('');
  useEffect(()=>{if(!enabled)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;
    //: Последовательно опрашивает состояние и свежий QR, пока открыт экран.
    //: Уход со страницы отменяет обновления; фоновые копии QR не создаются.
    async function refresh(){try{const value=await api<WhatsAppStatus>('whatsapp/status');if(!stopped)setStatus(value);}catch(error){if(!stopped)onError(error);}finally{if(!stopped)timer=setTimeout(refresh,2000);}}
    void refresh();return ()=>{stopped=true;clearTimeout(timer);};
  },[enabled]);
  //: Выполняет административное действие и показывает только безопасный результат.
  //: Автоматической отправки сообщений и сканирования QR здесь нет.
  async function run(task:()=>Promise<void>){if(!enabled)return;setBusy(true);setNotice('');try{await task();}catch(error){onError(error);}finally{setBusy(false);}}
  //: Загружает каталог метаданных WhatsApp без истории невыбранных чатов.
  //: Выбор других источников не отправляется и не сбрасывается.
  async function dialogs(){const result=await api<AdminDialogCatalog>('whatsapp/dialogs');setCatalog(result);setSelected(result.selectedIds);}
  return <fieldset className="whatsapp-panel" disabled={!enabled}><section className="admin-card"><h2>Подключение WhatsApp</h2>
    <p role="status">{!enabled?'Тестирование WhatsApp пока доступно только владельцу.':!status?'Проверка браузерного сервиса…':status.connected?'WhatsApp подключён':status.stage==='qr'?'Отсканируйте QR-код':status.stage==='starting'?'Запускается серверный браузер…':status.stage==='idle'?'WhatsApp не подключён':status.issue||'Соединение недоступно.'}</p>
    <p>На телефоне: WhatsApp → Настройки → Связанные устройства → Привязать устройство. Сканируйте QR с другого экрана. Браузер и сохранённая сессия работают на сервере.</p>
    {enabled&&status?.qrDataUrl&&status.stage==='qr'&&<img className="whatsapp-qr" src={status.qrDataUrl} alt="QR-код подключения WhatsApp" width="320" height="320"/>}
    <div className="admin-actions"><button disabled={busy||status?.connected||status?.stage==='busy'||status?.stage==='starting'||status?.stage==='qr'} onClick={()=>void run(async()=>{setStatus(await api<WhatsAppStatus>('whatsapp/begin',{}));})}>Подключить WhatsApp</button>
    {(status?.connected||status?.stage==='qr'||status?.stage==='starting'||status?.stage==='error')&&<button className="danger" disabled={busy} onClick={()=>{if(confirm('Отключить серверный WhatsApp? Сохранённые сообщения Messenger останутся.'))void run(async()=>{await api('whatsapp/disconnect',{});setStatus({stage:'idle',connected:false});setCatalog(undefined);setSelected([]);});}}>Отключить WhatsApp</button>}</div>
    <p>Первая версия: текстовые сообщения и обозначения вложений. Загрузка вложений и подтверждение прочтения выполняются в официальном WhatsApp. Подключение неофициальное; возможны ограничения WhatsApp.</p>
  </section><section className="admin-card"><h2>Разрешённые диалоги WhatsApp</h2><p>История передаётся только для отмеченных диалогов. На этом сервере доступна одна активная WhatsApp-сессия.</p>
    <button disabled={busy||!status?.connected} onClick={()=>void run(dialogs)}>Получить список диалогов WhatsApp</button>
    {enabled&&catalog&&<ConversationPicker catalog={catalog} selected={selected} busy={busy} onChange={setSelected} onSave={()=>void run(async()=>{const result=await api<{selectedIds:string[]}>('whatsapp/selection',{ids:selected});setSelected(result.selectedIds);setNotice('Выбор WhatsApp сохранён.');})}/>}{notice&&<p role="status">{notice}</p>}
  </section></fieldset>;
}
