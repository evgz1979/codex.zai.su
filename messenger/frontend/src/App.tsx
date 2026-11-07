import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { destinationFor, LIMITS, type Conversation, type ConversationPageResult, type Message, type MessagePage, type SessionInfo, type Snapshot, type SyncStatus } from '../../shared/types';
import AttachmentViewer from './AttachmentViewer';
import type {AttachmentRequest} from '../../shared/types';
import { api, ApiError, setCsrf } from './api';

//: Форматирует время сообщения для интерфейса.
//: Использует локаль ru-RU и часовой пояс браузера.
const time = (date: string) => new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
//: Форматирует подпись календарной даты в ленте.
//: Использует локаль ru-RU и часовой пояс браузера.
const day = (date: string) => new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
//: Выбирает локальный SVG для рабочей кнопки.
//: Не загружает внешние изображения или скрипты.
function Icon({ name }: { name: 'send' | 'menu' | 'close' | 'search' | 'logout' }) {
  const paths = { send: 'm4 4 17 8-17 8 3-8-3-8m3 8h14', menu: 'M4 6h16M4 12h16M4 18h16', close: 'm6 6 12 12M18 6 6 18', search: 'm15 15 5 5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', logout: 'M9 4H4v16h5m6-13 5 5-5 5M8 12h12' };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
//: Отображает название приложения.
//: Не добавляет рекламные подписи и вводные тексты.
function Brand() { return <div className="brand"><span className="monogram">Z</span><strong>Z AI <span>Messenger</span></strong></div>; }
//: Отображает вход, единую ленту и поле ввода с явным адресатом.
//: Держит снимок и черновики в памяти React, без хранилища браузера.
export function App() {
  const [session, setSession] = useState<SessionInfo>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [attachmentTarget,setAttachmentTarget]=useState<AttachmentRequest>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading,setLoading]=useState(false);
  const [page,setPage]=useState<MessagePage>();
  const [cacheRevision,setCacheRevision]=useState(0);
  const [syncStatus,setSyncStatus]=useState<SyncStatus>();
  const [password, setPassword] = useState('');
  const [targetId, setTargetId] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const composerInput=useRef<HTMLTextAreaElement>(null);
  const request=useRef<{id:number;controller?:AbortController}>({id:0});
  const access=useRef<{ids?:Set<string>;revision:number}>({revision:0});
  const scrollPlan=useRef<{mode:'bottom'|'preserve';height?:number;top?:number;anchor?:{id:string;offset:number}}|undefined>(undefined);
  const target = snapshot?.conversations.find(c => c.id === targetId);
  const messages=page?.conversationId===(target?.id||'inbox')?page.messages:target?[]:snapshot?.messages||[];
  const pending=busy||loading;
  const sentinel=useRef<HTMLDivElement>(null);
  const live=useRef<{targetId?:string;pending:boolean;revision:number;uncertain:boolean}>({pending:false,revision:0,uncertain:false});
  live.current={targetId,pending,revision:cacheRevision,uncertain};
  const olderAttempt=useRef('');const cacheUpdate=useRef(false);const appliedRevision=useRef(0);const seenRevision=useRef(0);const uncertainAt=useRef(0);
  const draft = target ? drafts[target.id] || '' : '';
  const unread = snapshot?.conversations.reduce((n,c) => n + c.unreadCount, 0) || 0;
  const connected = snapshot?.sources.some(s => s.connected);

  //: Применяет состояние веб-входа и CSRF в памяти.
  //: Не читает и не получает Telegram credentials.
  const acceptSession = (info: SessionInfo) => { setCsrf(info.csrfToken || ''); setSession(info); };
  //: Показывает ошибку операции и обрабатывает потерю входа.
  //: При 401 очищает снимок, адресата и черновики.
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) { setAttachmentTarget(undefined);cancelView();acceptSession({ authenticated: false, setupRequired: false }); setSnapshot(undefined); setPage(undefined);setDrafts({}); setTargetId(undefined); }
    setError(e instanceof Error ? e.message : 'Нет связи с локальным сервером.');
  }
  useEffect(() => { api<SessionInfo>('session').then(acceptSession).catch(fail); }, []);
  useEffect(() => {
    if (session?.authenticated) api<ConversationPageResult>('inbox',{}).then(result=>{scrollPlan.current={mode:'bottom'};setSnapshot(result.snapshot);setPage(result.page);}).catch(fail);
  }, [session?.authenticated]);
  useEffect(() => {
    if (!session?.authenticated) return;
    let disposed = false;
    let checking=false;
    //: Получает разрешения и ревизию SQLite без запросов к Telegram.
    //: Изменения и удаления автоматически применяются только к разрешённой ленте.
    async function checkAccess() {
      if(checking||document.hidden)return;checking=true;
      try {
        const result=await api<{ids:string[];revision?:number;deletedIds?:string[];reset?:boolean;sync?:SyncStatus}>(`access?since=${seenRevision.current}`);
        if(disposed)return;
        const ids=new Set(result.ids);const previous=access.current.ids;
        if(previous&&(previous.size!==ids.size||[...previous].some(id=>!ids.has(id)))){access.current.revision++;cancelView();}
        access.current.ids=ids;
        const deleted=new Set(result.deletedIds||[]);
        setAttachmentTarget(old=>old&&ids.has(old.conversationId)&&!deleted.has(old.messageId)&&!result.reset?old:undefined);
        setSnapshot(old=>old?{...old,conversations:old.conversations.filter(c=>ids.has(c.id)),messages:old.messages.filter(m=>ids.has(m.conversationId)&&!deleted.has(m.id))}:old);
        setPage(old=>old&&(old.conversationId==='inbox'||ids.has(old.conversationId))&&!result.reset?{...old,messages:old.messages.filter(m=>ids.has(m.conversationId)&&!deleted.has(m.id))}:undefined);
        setTargetId(old=>old&&ids.has(old)?old:undefined);setDrafts(old=>Object.fromEntries(Object.entries(old).filter(([id])=>ids.has(id))));
        if(result.sync)setSyncStatus(result.sync);
        if(typeof result.revision==='number'){
          seenRevision.current=result.revision;setCacheRevision(result.revision);
          if(result.revision!==appliedRevision.current||live.current.uncertain)await updateFromCache(result.revision);
        }
      }catch(e){if(!disposed)fail(e);}finally{checking=false;}
    }
    void checkAccess();const timer=window.setInterval(checkAccess,2000);document.addEventListener('visibilitychange',checkAccess);
    return()=>{disposed=true;window.clearInterval(timer);document.removeEventListener('visibilitychange',checkAccess);};
  },[session?.authenticated]);
  useLayoutEffect(()=>{
    const element=feed.current;const plan=scrollPlan.current;if(!element||!plan)return;
    const anchor=plan.anchor?element.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(plan.anchor.id)}"]`):undefined;
    if(plan.mode==='preserve'&&anchor&&plan.anchor)element.scrollTop+=anchor.getBoundingClientRect().top-element.getBoundingClientRect().top-plan.anchor.offset;
    else element.scrollTop=plan.mode==='preserve'?(plan.top||0)+element.scrollHeight-(plan.height||0):element.scrollHeight;
    scrollPlan.current=undefined;
  },[snapshot?.messages,page?.messages,targetId]);
  useEffect(()=>()=>{request.current.controller?.abort();request.current.id++;},[]);
  useLayoutEffect(()=>{const input=composerInput.current;if(!input)return;input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,128)}px`;},[draft,targetId,session?.authenticated]);
  useEffect(() => {
    if (!drawer) return;
    //: Закрывает мобильный список по Escape.
    //: Listener снимается cleanup-функцией эффекта.
    const listener = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [drawer]);
  useEffect(()=>{
    const element=sentinel.current;const c=target;const cursor=page?.nextCursor;
    if(!element||!cursor||typeof IntersectionObserver==='undefined')return;
    const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting)||live.current.pending)return;const key=`${c?.id||'inbox'}/${cursor}/${live.current.revision}`;if(olderAttempt.current===key)return;olderAttempt.current=key;void loadView(c,true);},{root:feed.current,rootMargin:'0px'});
    observer.observe(element);return()=>observer.disconnect();
  },[targetId,page?.nextCursor,cacheRevision,loading]);
  //: Автоматически перечитывает изменившийся кеш без ожидания MTProto.
  //: Сохраняет старые страницы и не прерывает явный выбор или прокрутку.
  async function updateFromCache(revision:number){
    if(live.current.pending||cacheUpdate.current)return;cacheUpdate.current=true;
    const id=live.current.targetId;const generation=request.current.id;
    try{
      const result=await api<ConversationPageResult>(id?'open':'inbox',id?{conversationId:id}:{});
      const state=result.snapshot;
      if(generation!==request.current.id||id!==live.current.targetId||live.current.pending)return;
      const element=feed.current;if(element&&element.scrollHeight-element.scrollTop-element.clientHeight<100)scrollPlan.current={mode:'bottom'};
      setSnapshot(state);
      if(result)setPage(old=>{
        const fresh=result.page;if(!old||old.conversationId!==fresh.conversationId)return fresh;
        if(!fresh.messages.length)return fresh;
        const boundary=fresh.messages[0];const older=old.messages.filter(m=>m.date<boundary.date||(m.date===boundary.date&&m.id<boundary.id));
        return {...fresh,messages:[...older,...fresh.messages],oldestCursor:older.length?old.oldestCursor:fresh.oldestCursor,nextCursor:older.length?(old.nextCursor||(!fresh.historyComplete?old.oldestCursor||null:null)):fresh.nextCursor};
      });
      if(result?.page.sourceUpdatedAt&&result.page.sourceUpdatedAt>uncertainAt.current)setUncertain(false);
      appliedRevision.current=revision;
    }catch(e){if(generation===request.current.id)fail(e);}finally{cacheUpdate.current=false;}
  }
  //: Отправляет пароль локальному API и принимает новую сессию.
  //: После успеха очищает поле пароля, во время запроса блокирует повтор.
  async function login(e: FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try { acceptSession(await api<SessionInfo>('login', { password })); setPassword(''); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  //: Отменяет устаревший HTTP-запрос и запрещает применение позднего ответа.
  //: Не отзывает уже отправленный Telegram RPC или пользовательскую сессию.
  function cancelView(){request.current.controller?.abort();request.current.id++;live.current.pending=false;setLoading(false);}
  //: Загружает десять сообщений одного адресата или предыдущую страницу.
  //: Быстрое переключение отменяет прежний ответ; догрузка сохраняет положение прокрутки.
  async function loadView(conversation?:Conversation,older=false){
    if(busy)return;
    const before=older&&page&&page.conversationId===(conversation?.id||'inbox')?page.nextCursor:undefined;
    if(older&&!before)return;
    request.current.controller?.abort();const controller=new AbortController();const id=++request.current.id;request.current.controller=controller;
    const revision=access.current.revision;live.current.pending=true;setLoading(true);setError('');
    try{
      const result=await api<ConversationPageResult>(conversation?(older?'older':'open'):'inbox',{...(conversation?{conversationId:conversation.id}:{}),...(before?{before}:{})},controller.signal);
      if(id!==request.current.id||revision!==access.current.revision)return;
      if(older){
        const element=feed.current;const top=element?.getBoundingClientRect().top||0;
        const anchor=element&&[...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(node=>node.getBoundingClientRect().bottom>top);
        scrollPlan.current={mode:'preserve',height:element?.scrollHeight,top:element?.scrollTop,...(anchor?{anchor:{id:anchor.dataset.messageId!,offset:anchor.getBoundingClientRect().top-top}}:{})};
      }else scrollPlan.current={mode:'bottom'};
      setSnapshot(result.snapshot);
      setPage(old=>older&&old?.conversationId===result.page.conversationId?{...result.page,messages:[...new Map([...old.messages,...result.page.messages].map(m=>[m.id,m])).values()].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))}:result.page);

    }catch(e){if(id===request.current.id&&!controller.signal.aborted)fail(e);}
    finally{if(id===request.current.id){live.current.pending=false;setLoading(false);}}
  }
  //: Выбирает адресата и подгружает его последние сообщения.
  //: Сохраняет раздельные черновики, закрывает мобильную панель.
  async function choose(c: Conversation) {
    if (busy) return;
    live.current.targetId=c.id;olderAttempt.current='';setTargetId(c.id);setPage(undefined);setDrawer(false);await loadView(c);
  }
  //: Фиксирует текст и Destination, затем создаёт уникальный request ID.
  //: Очищает только отправленный черновик; ошибка требует ручной сверки ленты.
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!target || !draft.trim() || pending || uncertain) return;
    const destination = destinationFor(target);
    const text = draft;
    setBusy(true); setError('');
    try {
      const message = await api<Message>('send', { destination, text, requestId: crypto.randomUUID() });
      scrollPlan.current={mode:'bottom'};
      setSnapshot(old => old ? { ...old, conversations: old.conversations.map(c => c.id === message.conversationId ? { ...c, preview:message.text, updatedAt:message.date } : c), messages: [...old.messages.filter(m => m.id !== message.id), message].sort((a,b) => a.date.localeCompare(b.date)).slice(-LIMITS.pageMessages) } : old);
      setPage(old=>old?.conversationId===message.conversationId?{...old,messages:[...old.messages.filter(m=>m.id!==message.id),message].sort((a,b)=>a.date.localeCompare(b.date))}:old);
      setDrafts(old => ({ ...old, [destination.conversationId]: '' }));
    } catch (e) { uncertainAt.current=Date.now();setUncertain(true);fail(e); } finally { setBusy(false); }
  }
  //: Отправляет явную отметку прочитанного для выбранного диалога.
  //: Снимок заменяется только после ответа API.
  async function read() {
    if (!target) return;
    setBusy(true); setError('');
    try { setSnapshot(await api<Snapshot>('read', { conversationId: target.id })); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  //: Отзывает текущую веб-сессию и очищает состояние переписки UI.
  //: Не завершает Telegram-авторизацию на сервере.
  async function logout() {
    setAttachmentTarget(undefined);cancelView();setBusy(true);
    try {
      await api('logout', {}); acceptSession({ authenticated: false, setupRequired: false });
      setSnapshot(undefined);setPage(undefined);setDrafts({});setTargetId(undefined);setError('');setUncertain(false);seenRevision.current=0;appliedRevision.current=0;access.current={revision:0};
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (!session || !session.authenticated) return <main className="entry">
    <div className="entry-brand"><Brand /></div>
    <section className="login-card">
      <h1>Вход</h1>
      {!session ? <p role="status">{error || 'Подключение к серверу…'}</p> : session.setupRequired ? <p role="status">Вход ещё не настроен.</p> : <form onSubmit={login} className="login-form">
        <label htmlFor="password">Пароль</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={512} autoFocus />
        <button className="primary" disabled={busy}>{busy ? 'Вход…' : 'Войти в Messenger'}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>}
    </section>
  </main>;

  return <main className={`workspace ${drawer ? 'drawer-open' : ''}`}>
    {drawer && <button className="scrim" aria-label="Закрыть список диалогов" onClick={() => setDrawer(false)} />}
    <aside className="sidebar" aria-label="Диалоги">
      <div className="sidebar-brand"><Brand /><button className="icon-button mobile-only" aria-label="Закрыть диалоги" onClick={() => setDrawer(false)}><Icon name="close" /></button></div>
      <div className="sidebar-heading"><h2>Диалоги</h2><span className="count">{snapshot?.conversations.length || 0}</span></div>
      <label className="search"><Icon name="search" /><input aria-label="Поиск диалогов" placeholder="Найти разговор" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <button className={`all-row ${!target ? 'active' : ''}`} disabled={busy} onClick={() => { cancelView();live.current.targetId=undefined;setTargetId(undefined);setPage(undefined);scrollPlan.current={mode:'bottom'};setDrawer(false);void loadView(); }}><span className="all-symbol">≋</span><span>Общая лента</span>{unread > 0 && <b className="badge" aria-label={`${unread} непрочитанных`}>{unread}</b>}</button>
      <nav className="conversation-list" aria-label="Получатели">
        {snapshot?.conversations.filter(c => c.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((c,i) => <button key={c.id} className={`conversation ${target?.id === c.id ? 'selected' : ''}`} disabled={busy} onClick={() => choose(c)} aria-pressed={target?.id === c.id}>
          <span className={`avatar tone-${i % 4}`}>{c.title.slice(0,1).toUpperCase()}</span>
          <span className="conversation-copy"><span className="conversation-title"><span className="conversation-name" title={c.title}>{c.title}</span><time>{c.updatedAt && time(c.updatedAt)}</time></span><span className="preview"><span className="source-caption">{snapshot.sources.find(s => s.id === c.sourceId)?.name} · </span>{c.preview || (c.kind === 'group' ? 'Группа' : c.kind === 'channel' ? 'Канал' : 'Личный диалог')}</span></span>
          {c.unreadCount > 0 && <span className="badge">{c.unreadCount}</span>}
        </button>)}
        {!snapshot?.conversations.length && <p className="list-empty">Здесь появятся ваши диалоги после подключения аккаунта и выбора в админке.</p>}
      </nav>
      <div className="sidebar-footer"><span><i className={`status-dot ${connected ? '' : 'muted'}`} />{unread} непрочитанных</span><button className="icon-button" aria-label="Выйти" onClick={logout} disabled={busy}><Icon name="logout" /></button></div>
    </aside>
    <section className="chat" aria-label="Единая лента сообщений">
      <header className="chat-header"><button className="icon-button mobile-only" aria-label="Открыть диалоги" onClick={() => setDrawer(true)}><Icon name="menu" /></button><div><div className="header-title"><h1>{target?.title||'Общая лента'}</h1></div><p>{unread} непрочитанных</p></div></header>
      <div className="feed-info"><span className="status-dot" />{syncStatus?.pausedUntil?'Синхронизация временно приостановлена':syncStatus?.pendingConversations?'История синхронизируется в фоне':'Автоматическая синхронизация'}<span className="feed-limit">Сообщения из локального кеша</span></div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="feed" ref={feed} tabIndex={0} aria-label="Сообщения" aria-busy={pending}>
        <div ref={sentinel} className="history-sentinel" aria-hidden="true" />
        {!messages.length ? <div className="empty-state"><h2>{loading?'Загрузка сообщений…':'Нет загруженных сообщений'}</h2></div> : <div className="message-stream">{messages.map((m,i,messages) => {
          const c = snapshot?.conversations.find(c => c.id === m.conversationId);
          return <div key={m.id}>{(i === 0 || day(messages[i-1].date) !== day(m.date)) && <div className="date-divider"><span>{day(m.date)}</span></div>}
            <article data-message-id={m.id} className={`message ${m.outgoing ? 'outgoing' : ''}`} aria-label={`Сообщение: ${m.sender.name}`}>
              <div className="bubble">
                {!target&&<div className="message-context"><strong>{c?.title || 'Диалог'}</strong><span className="source-label">{snapshot?.sources.find(s => s.id === m.sourceId)?.name || 'Источник'}</span></div>}
                {!m.outgoing && c?.kind === 'group' && <strong className="sender-name">{m.sender.name}</strong>}
                {m.text && <p>{m.text}</p>}{m.attachments.map(a => a.downloadable===false?<div key={a.id} className="attachment">{a.name}</div>:<button key={a.id} className="attachment attachment-button" onClick={()=>setAttachmentTarget({conversationId:m.conversationId,messageId:m.id,attachmentId:a.id})} aria-label={`Открыть вложение: ${a.name}`}><span aria-hidden="true">{a.kind==='image'?'▧':a.kind==='video'?'▷':a.kind==='audio'?'♪':'▤'}</span><span>{a.kind==='unsupported'?'Открыть вложение':a.name}{a.size!==undefined&&<small>{Math.ceil(a.size/1024)} КБ</small>}</span></button>)}
                <div className="message-meta">{!target&&c?.canSend&&<button className="reply-button" disabled={busy} onClick={() => choose(c)}>Ответить <span aria-hidden="true">↗</span></button>}<time dateTime={m.date}>{time(m.date)}</time>{m.outgoing && <span aria-label="Отправлено">✓</span>}</div>
              </div>
            </article></div>;
        })}</div>}
      </div>
      <div className="composer-area">
        <div className="destination">{target ? <><span className="destination-recipient" title={target.title}>Кому: <strong>{target.title}</strong><span className="destination-source"> · {snapshot?.sources.find(s => s.id === target.sourceId)?.name}</span></span><button disabled={busy} onClick={() => setDrawer(true)}>Изменить</button></> : <><span>Адресат не выбран</span><button onClick={() => setDrawer(true)}>Выбрать <span aria-hidden="true">↗</span></button></>}</div>
        <form className="composer" onSubmit={send}><textarea ref={composerInput} aria-label="Сообщение" placeholder={target ? target.canSend ? 'Написать сообщение…' : 'Этот диалог доступен только для чтения' : 'Сначала выберите адресата'} rows={1} value={draft} maxLength={LIMITS.text} disabled={!target?.canSend || pending} onChange={e => target && setDrafts(old => ({ ...old, [target.id]: e.target.value }))} /><button className="send-button" type="submit" aria-label={target ? `Отправить: ${target.title}` : 'Отправить сообщение'} disabled={!target?.canSend || !draft.trim() || pending || uncertain}><Icon name="send" /></button></form>
        {(uncertain||(target&&target.unreadCount>0)||draft.length>3500)&&<div className="composer-note">{uncertain && <span>Дождитесь синхронизации и проверьте отправку перед повтором</span>}{target && target.unreadCount > 0 && <button disabled={pending} onClick={read}>Отметить прочитанным</button>}{draft.length > 3500 && <span>{draft.length}/{LIMITS.text}</span>}</div>}
      </div>
    </section>
    {attachmentTarget&&<AttachmentViewer key={`${attachmentTarget.messageId}/${attachmentTarget.attachmentId}`} request={attachmentTarget} onClose={()=>setAttachmentTarget(undefined)} onUnauthorized={fail}/>}
  </main>;
}
