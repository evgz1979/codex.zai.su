import { useEffect,useState,type FormEvent } from 'react';
import {telegramAuthIssueText,PASSWORD_LIMITS} from '../../../shared/types';
import { api,ApiError,setCsrf } from '../api';
import type { SessionInfo,AdminStatus,AdminDialogCatalog,TelegramAuthStage } from '../../../shared/types';
import ConversationPicker from './ConversationPicker';
//: Отображает отдельный административный интерфейс.
//: Доступ к настройкам дополнительно проверяется API, а не маршрутом браузера.
export default function AdminApp() {
  const [session,setSession]=useState<SessionInfo>(); const [status,setStatus]=useState<AdminStatus>();
  const [password,setPassword]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  const [section,setSection]=useState<'telegram'|'access'>('telegram');
  const [apiId,setApiId]=useState(''); const [apiHash,setApiHash]=useState(''); const [phone,setPhone]=useState(''); const [value,setValue]=useState('');
  const [stage,setStage]=useState<TelegramAuthStage>('idle'); const [catalog,setCatalog]=useState<AdminDialogCatalog>(); const [selected,setSelected]=useState<string[]>([]);
  const [newPassword,setNewPassword]=useState(''); const [passwordRole,setPasswordRole]=useState<'admin'|'chat'>('chat');
  //: Применяет результат административного входа.
  //: CSRF хранится только в памяти этой страницы.
  function accept(info:SessionInfo) { setSession(info);setCsrf(info.csrfToken||''); }
  //: Показывает безопасную ошибку и обрабатывает потерю прав.
  //: При 401 очищает административные данные страницы.
  function fail(e:unknown) { setError(e instanceof Error?e.message:'Операция не выполнена.'); if(e instanceof ApiError&&e.status===401){accept({authenticated:false,setupRequired:false});setCatalog(undefined);setSelected([]);setStatus(undefined);} }
  //: Управляет блокировкой и ошибкой административного действия.
  //: Не журналирует аргументы и результаты секретных форм.
  async function run(task:()=>Promise<void>) { setBusy(true);setError('');setNotice('');try{await task();}catch(e){fail(e);}finally{setBusy(false);} }
  //: Получает безопасные статусы источника.
  //: Не запрашивает реквизиты или код авторизации.
  async function refreshStatus() { const state=await api<AdminStatus>('status');setStatus(state);setStage(state.telegram.stage); }
  useEffect(()=>{api<SessionInfo>('session').then(accept).catch(fail);},[]);
  useEffect(()=>{if(session?.authenticated)void run(refreshStatus);},[session?.authenticated]);
  //: Выполняет отдельный административный вход.
  //: Использует admin API и очищает поле пароля после успеха.
  function login(e:FormEvent) { e.preventDefault();void run(async()=>{accept(await api<SessionInfo>('login',{password}));setPassword('');}); }
  //: Завершает административную сессию.
  //: Очищает список диалогов и секретные поля формы.
  async function logout() { await api('logout',{});accept({authenticated:false,setupRequired:false});setCatalog(undefined);setStatus(undefined);setApiHash('');setValue(''); }
  //: Загружает метаданные каталога и сохранённые галочки.
  //: История не запрашивается этой формой.
  async function loadDialogs() { const result=await api<AdminDialogCatalog>('dialogs');setCatalog(result);setSelected(result.selectedIds);await refreshStatus(); }
  //: Сохраняет общий выбор, включая скрытые текущей закладкой диалоги.
  //: Папка не отправляется как разрешение и не включает новые чаты автоматически.
  async function saveSelection() {await api('selection',{ids:selected});setNotice('Выбор сохранён.');await refreshStatus();}
  //: Отправляет начальные реквизиты Telegram в admin API.
  //: Очищает api_hash и телефон в форме перед ожиданием ответа.
  async function begin(e:FormEvent) { e.preventDefault(); const input={apiId:Number(apiId),apiHash,phone};setApiHash('');setPhone('');void run(async()=>{const result=await api<{stage:TelegramAuthStage}>('telegram/begin',input);setStage(result.stage);await refreshStatus();}); }
  //: Отправляет значение ожидаемого шага code или 2FA.
  //: Очищает секретное поле, после успеха получает только метаданные диалогов.
  function answer(e:FormEvent) { e.preventDefault(); const input=value;setValue('');void run(async()=>{const result=await api<{stage:TelegramAuthStage}>(`telegram/${stage}`,{value:input});setStage(result.stage);await refreshStatus();if(result.stage==='connected')await loadDialogs();}); }
  if(!session?.authenticated) return <main className="admin-login"><h1>Администрирование</h1>{!session?<p>Подключение…</p>:session.setupRequired?<p>Вход ещё не настроен на сервере.</p>:<form onSubmit={login}><label>Пароль администратора<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} maxLength={512}/></label><button disabled={busy}>Войти</button></form>}{error&&<p role="alert">{error}</p>}</main>;
  return <main className="admin-layout"><aside className="admin-nav"><strong>Z AI Messenger</strong><span>Администрирование</span><button className={section==='telegram'?'current':''} onClick={()=>setSection('telegram')}>Источники → Telegram</button><button className={section==='access'?'current':''} onClick={()=>setSection('access')}>Доступ</button><a href="/" target="_blank" rel="noreferrer">Открыть чат</a><button disabled={busy} onClick={()=>void run(logout)}>Выйти из админки</button></aside><section className="admin-content"><header><h1>{section==='telegram'?'Источники → Telegram':'Доступ'}</h1></header>{error&&<p className="admin-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {section==='telegram'?<><section className="admin-card"><h2>Подключение</h2><p role="status">{status?.telegram.configured?'Сессия сохранена на сервере':stage==='code'?'Ожидается код Telegram':stage==='password'?'Ожидается пароль 2FA':stage==='error'?'Вход не выполнен':stage==='connecting'?'Подключение…':'Telegram не подключён'}</p>{status?.telegram.issue&&<p className="admin-error" role="alert">{telegramAuthIssueText(status.telegram.issue)}</p>}
  {!status?.telegram.configured&&!['code','password','connecting'].includes(stage)&&<form onSubmit={begin} autoComplete="off"><label>api_id<input required inputMode="numeric" value={apiId} onChange={e=>setApiId(e.target.value)}/></label><label>api_hash<input type="password" required autoComplete="off" value={apiHash} onChange={e=>setApiHash(e.target.value)}/></label><label>Номер телефона<input type="tel" required placeholder="+..." autoComplete="off" value={phone} onChange={e=>setPhone(e.target.value)}/></label><button disabled={busy}>Получить код</button></form>}
  {(stage==='code'||stage==='password')&&<form onSubmit={answer} autoComplete="off"><label>{stage==='code'?'Код Telegram':'Пароль 2FA'}<input type="password" required value={value} onChange={e=>setValue(e.target.value)} autoComplete="off" maxLength={512}/></label><button disabled={busy}>Подтвердить</button></form>}
  {!status?.telegram.configured&&['code','password','error','connecting'].includes(stage)&&<button disabled={busy} onClick={()=>void run(async()=>{await api('telegram/cancel',{});await refreshStatus();})}>Отменить вход</button>}
  <div className="admin-actions"><button disabled={busy} onClick={()=>void run(refreshStatus)}>Обновить статус</button>{status?.telegram.configured&&<button className="danger" disabled={busy} onClick={()=>{if(confirm('Отключить Telegram и убрать его диалоги из чата? Сохранённые сообщения останутся на сервере.'))void run(async()=>{await api('telegram/disconnect',{});setCatalog(undefined);setSelected([]);await refreshStatus();});}}>Отключить Telegram</button>}</div>
  </section><section className="admin-card"><h2>Разрешённые диалоги</h2><p>В чат передаются только отмеченные диалоги. История остальных не загружается. Снятие отметки сохраняет ранее полученные данные на сервере.</p><button disabled={busy||!status?.telegram.configured} onClick={()=>void run(loadDialogs)}>Получить список диалогов</button>{catalog&&<ConversationPicker catalog={catalog} selected={selected} busy={busy} onChange={setSelected} onSave={()=>void run(saveSelection)}/>}
  </section></>:<section className="admin-card"><h2>Изменение пароля</h2><form onSubmit={e=>{e.preventDefault();const input=newPassword;setNewPassword('');void run(async()=>{await api('password',{role:passwordRole,password:input});setNotice('Пароль изменён. Сессии этой роли завершены.');if(passwordRole==='admin'){accept({authenticated:false,setupRequired:false});setCatalog(undefined);setStatus(undefined);}});}}><label>Роль<select value={passwordRole} onChange={e=>setPasswordRole(e.target.value as 'admin'|'chat')}><option value="chat">Пользовательский чат</option><option value="admin">Администратор</option></select></label><label>Новый пароль<input type="password" autoComplete="new-password" minLength={PASSWORD_LIMITS.min} maxLength={PASSWORD_LIMITS.max} required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><button disabled={busy}>Изменить пароль</button></form></section>}
  </section></main>;
}
