import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { destinationFor,messagePreview,compareConversations, LIMITS, type Conversation, type ConversationPageResult, type Message, type MessagePage, type SessionInfo, type Snapshot, type SyncStatus } from '../../shared/types';
import AppUpdates,{useAppUpdates} from './AppUpdates';
import Avatar,{clearAvatars} from './Avatar';
import AttachmentPreview from './AttachmentPreview';
import {clearPreviews} from './previews';
import AttachmentViewer from './AttachmentViewer';
import VoiceTranscription from './VoiceTranscription';
import type {AttachmentRequest} from '../../shared/types';
import { api, ApiError, readCachedPage, setCsrf,appBase,isOffline } from './api';
import {useOffline} from './useOffline';
import {useOfflinePrefetch} from './useOfflinePrefetch';
import Notifications,{notificationEndpoint,unsubscribeNotifications} from './Notifications';
import {useVisibleReads} from './useVisibleReads';
import {useAppBadge} from './useAppBadge';
import {useConversationArrival} from './useConversationArrival';

//: Форматирует время сообщения для интерфейса.
//: Использует локаль ru-RU и часовой пояс браузера.
const time = (date: string) => new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
//: Форматирует подпись календарной даты в ленте.
//: Использует локаль ru-RU и часовой пояс браузера.
const day = (date: string) => new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
//: Форматирует дату последнего сообщения в списке чатов.
//: Сегодня показывает время, за последнюю неделю — день, дальше — календарную дату.
function conversationTime(date:string){
  const value=new Date(date);const today=new Date();const midnight=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime();const days=Math.round((midnight-new Date(value.getFullYear(),value.getMonth(),value.getDate()).getTime())/86400000);
  return days<=0?time(date):days===1?'вчера':days<7?value.toLocaleDateString('ru-RU',{weekday:'short'}):value.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'});
}
//: Выбирает локальный SVG для рабочей кнопки.
//: Не загружает внешние изображения или скрипты.
function Icon({ name }: { name: 'send' | 'back' | 'inbox' | 'search' | 'logout' }) {
  const paths = { send: 'm4 4 17 8-17 8 3-8-3-8m3 8h14', back: 'm14 5-7 7 7 7M7 12h14', inbox: 'M4 4h16v12h-5l-3 4-3-4H4V4m4 4h8m-8 4h5', search: 'm15 15 5 5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', logout: 'M9 4H4v16h5m6-13 5 5-5 5M8 12h12' };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
//: Отображает название приложения.
//: Не добавляет рекламные подписи и вводные тексты.
function Brand() { return <div className="brand"><span className="monogram">Z</span><strong>Z AI <span>Messenger</span></strong></div>; }
//: Отображает вход, список чатов и отдельную переписку с явным адресатом.
//: Держит снимок и черновики в памяти React, без хранилища браузера.
export function App() {
  const offline=useOffline();
  const updates=useAppUpdates();
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
  const [chatOpen,setChatOpen]=useState(false);
  const [onlyUnread,setOnlyUnread]=useState(false);
  const viewOpen=useRef(false);viewOpen.current=chatOpen;
  const [uncertain, setUncertain] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const composerInput=useRef<HTMLTextAreaElement>(null);
  const request=useRef<{id:number;controller?:AbortController}>({id:0});
  const access=useRef<{ids?:Set<string>;revision:number}>({revision:0});
  const scrollPlan=useRef<{mode:'bottom'|'preserve';height?:number;top?:number;anchor?:{id:string;offset:number}}|undefined>(undefined);
  const target = snapshot?.conversations.find(c => c.id === targetId);
  const messages=page?.conversationId===(targetId||'inbox')?page.messages:[];
  const arrival=useConversationArrival({authenticated:!!session?.authenticated,busy:busy||loading||uncertain,blocked:!!drafts[targetId||'']||!!attachmentTarget,navigate:openArrival,fail});
  const pending=busy||loading||arrival.opening;
  const arrivalOpening=useRef(arrival.opening);arrivalOpening.current=arrival.opening;
  const sentinel=useRef<HTMLDivElement>(null);
  const live=useRef<{targetId?:string;pending:boolean;revision:number;uncertain:boolean}>({pending:false,revision:0,uncertain:false});
  live.current={targetId,pending,revision:cacheRevision,uncertain};
  const olderAttempt=useRef('');const cacheUpdate=useRef(false);const appliedRevision=useRef(0);const seenRevision=useRef(0);const uncertainAt=useRef(0);
  const draft = target ? drafts[target.id] || '' : '';
  const unread = snapshot?.conversations.reduce((n,c) => n + c.unreadCount, 0) || 0;
  const connected = snapshot?.sources.some(s => s.connected);
  const preparation=useOfflinePrefetch(snapshot,!!session?.authenticated&&!offline,fail);
  useAppBadge(unread,!!session?.authenticated&&!!snapshot);
  useVisibleReads(feed,messages.filter(m=>snapshot?.sources.find(s=>s.id===m.sourceId)?.canMarkRead!==false),!!session?.authenticated&&!offline&&!pending&&chatOpen&&!attachmentTarget,async message=>{
    const result=await api<Snapshot>('read',{conversationId:message.conversationId,messageId:message.id});
    const conversation=result.conversations.find(c=>c.id===message.conversationId);
    if(conversation)setSnapshot(old=>old?{...old,conversations:old.conversations.map(c=>c.id===conversation.id?{...c,unreadCount:conversation.unreadCount}:c)}:old);
  });

  //: Применяет состояние веб-входа и CSRF в памяти.
  //: Не читает и не получает Telegram credentials.
  const acceptSession = (info: SessionInfo) => { setCsrf(info.csrfToken || ''); setSession(previous=>({...info,account:info.account||previous?.account}));if(info.account)document.title=`${info.account.displayName} · Z AI Messenger`;if(!info.authenticated){clearPreviews();clearAvatars();cancelView();setSnapshot(undefined);setPage(undefined);setDrafts({});setTargetId(undefined);setChatOpen(false);viewOpen.current=false;setAttachmentTarget(undefined);} };
  //: Показывает ошибку операции и обрабатывает потерю входа.
  //: При 401 очищает снимок, адресата и черновики.
  function fail(e: unknown) {
    if(e instanceof ApiError&&e.status===0){setError(session?.authenticated?'':'Для входа нужна связь.');return;}
    if (e instanceof ApiError && e.status === 401) { clearPreviews();clearAvatars();setChatOpen(false);setAttachmentTarget(undefined);cancelView();acceptSession({ authenticated: false, setupRequired: false }); setSnapshot(undefined); setPage(undefined);setDrafts({}); setTargetId(undefined); }
    setError(e instanceof Error ? e.message : 'Нет связи с локальным сервером.');
  }
  useEffect(() => {
    //: Проверяет и продлевает веб-вход при запуске, возвращении и восстановлении сети.
    //: Без связи API возвращает только ранее разрешённое локальное чтение.
    const check=()=>{void api<SessionInfo>('session').then(acceptSession).catch(e=>{if(e instanceof ApiError&&e.status===0)setError('Нет связи. Откройте приложение с интернетом, чтобы сохранить сообщения.');else fail(e);});};
    //: Очищает интерфейс при выходе в другом окне того же личного аккаунта.
    //: Событие не переносит тексты или токены между окнами.
    const localLogout=()=>fail(new ApiError(401,'Войдите в приложение.'));
    //: Обновляет срок только видимого окна, не меняя переписку и черновики.
    //: Фоновое окно не удерживает вход бесконечными запросами.
    const visibleCheck=()=>{if(!document.hidden)check();};
    check();const timer=window.setInterval(visibleCheck,3600000);document.addEventListener('visibilitychange',visibleCheck);window.addEventListener('online',check);window.addEventListener('messenger:local-logout',localLogout);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',visibleCheck);window.removeEventListener('online',check);window.removeEventListener('messenger:local-logout',localLogout);};
  }, []);
  useEffect(()=>{
    if(!session?.authenticated||!session.expiresAt)return;
    //: Уточняет истёкший вход у сервера без явного выхода и отзыва push.
    //: Минутный таймер поддерживает длительные сессии без переполнения setTimeout.
    const expire=()=>{if(Date.now()>=session.expiresAt!)void api<SessionInfo>('session').then(acceptSession).catch(e=>fail(e instanceof ApiError&&e.status===0?new ApiError(401,'Для продолжения войдите с подключением к сети.'):e));};
    const timer=window.setInterval(expire,60000);document.addEventListener('visibilitychange',expire);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',expire);};
  },[session?.authenticated,session?.expiresAt]);
  useEffect(() => {
    if (!session?.authenticated) return;
    let disposed = false;
    let checking=false;
    //: Получает разрешения и ревизию SQLite без запросов к Telegram.
    //: Изменения и удаления автоматически применяются только к разрешённой ленте.
    async function checkAccess() {
      if(checking||document.hidden||arrivalOpening.current||navigator.onLine===false)return;checking=true;
      const reconnecting=isOffline();
      try {
        const result=await api<{ids:string[];revision?:number;deletedIds?:string[];reset?:boolean;sync?:SyncStatus}>(`access?since=${seenRevision.current}`);
        if(disposed)return;
        const ids=new Set(result.ids);const previous=access.current.ids;
        if(previous&&(previous.size!==ids.size||[...previous].some(id=>!ids.has(id)))){clearPreviews();access.current.revision++;cancelView();}
        access.current.ids=ids;
        const deleted=new Set(result.deletedIds||[]);if(deleted.size||result.reset){clearPreviews();access.current.revision++;cancelView();}
        setAttachmentTarget(old=>old&&ids.has(old.conversationId)&&!deleted.has(old.messageId)&&!result.reset?old:undefined);
        setSnapshot(old=>old?{...old,conversations:old.conversations.filter(c=>ids.has(c.id)),messages:old.messages.filter(m=>ids.has(m.conversationId)&&!deleted.has(m.id))}:old);
        setPage(old=>old&&(old.conversationId==='inbox'||ids.has(old.conversationId))&&!result.reset?{...old,messages:old.messages.filter(m=>ids.has(m.conversationId)&&!deleted.has(m.id))}:undefined);
        if(live.current.targetId&&!ids.has(live.current.targetId))showList();
        setTargetId(old=>old&&ids.has(old)?old:undefined);setDrafts(old=>Object.fromEntries(Object.entries(old).filter(([id])=>ids.has(id))));
        if(result.sync)setSyncStatus(result.sync);
        if(typeof result.revision==='number'){
          seenRevision.current=result.revision;setCacheRevision(result.revision);
          if(reconnecting||result.revision!==appliedRevision.current||live.current.uncertain)await updateFromCache(result.revision,reconnecting);
        }
      }catch(e){if(!disposed)fail(e);}finally{checking=false;}
    }
    void checkAccess();const timer=window.setInterval(checkAccess,2000);document.addEventListener('visibilitychange',checkAccess);window.addEventListener('online',checkAccess);
    return()=>{disposed=true;window.clearInterval(timer);document.removeEventListener('visibilitychange',checkAccess);window.removeEventListener('online',checkAccess);};
  },[session?.authenticated]);
  useLayoutEffect(()=>{
    const element=feed.current;const plan=scrollPlan.current;if(!element||!plan)return;
    const anchor=plan.anchor?element.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(plan.anchor.id)}"]`):undefined;
    if(plan.mode==='preserve'&&anchor&&plan.anchor)element.scrollTop+=anchor.getBoundingClientRect().top-element.getBoundingClientRect().top-plan.anchor.offset;
    else element.scrollTop=plan.mode==='preserve'?(plan.top||0)+element.scrollHeight-(plan.height||0):element.scrollHeight;
    scrollPlan.current=undefined;
  },[snapshot?.messages,page?.messages,targetId]);
  useEffect(()=>()=>{request.current.controller?.abort();request.current.id++;},[]);
  useLayoutEffect(()=>{const input=composerInput.current;if(!input)return;input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,128)}px`;},[draft,targetId,chatOpen,session?.authenticated]);
  useEffect(()=>{
    //: Восстанавливает список либо разрешённый чат кнопками браузера.
    //: История содержит только ID; переходы не переносят черновики между адресатами.
    const back=(event:PopStateEvent)=>{
      if(!event.state?.messengerChat){showList();return;}
      const c=snapshot?.conversations.find(c=>c.id===event.state.conversationId);
      if(c)void choose(c,false);else if(event.state.conversationId==='inbox')void openInbox(false);else showList();
    };
    //: Возвращает из переписки в список по Escape без закрытия вложения.
    //: Модальное окно обрабатывает собственный Escape самостоятельно.
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&viewOpen.current&&!attachmentTarget)backToList();};
    window.addEventListener('popstate',back);window.addEventListener('keydown',escape);
    return()=>{window.removeEventListener('popstate',back);window.removeEventListener('keydown',escape);};
  },[snapshot?.conversations,attachmentTarget,busy]);
  useEffect(()=>{
    const element=sentinel.current;const c=target;const cursor=page?.nextCursor;
    if(!chatOpen||!element||!cursor||typeof IntersectionObserver==='undefined')return;
    const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting)||live.current.pending)return;const key=`${c?.id||'inbox'}/${cursor}/${live.current.revision}`;if(olderAttempt.current===key)return;olderAttempt.current=key;void loadView(c,true);},{root:feed.current,rootMargin:'0px'});
    observer.observe(element);return()=>observer.disconnect();
  },[targetId,page?.nextCursor,cacheRevision,loading,chatOpen]);
  //: Открывает список при обычном входе и точный разрешённый диалог по push.
  //: Возврат из фона сохраняет текущую переписку; ID уведомления проверяется до open.
  async function openArrival(intent:{conversationId?:string;explicit:boolean},signal:AbortSignal){
    if(!intent.explicit&&viewOpen.current)return;
    const generation=request.current.id;
    const inbox=await api<ConversationPageResult>('inbox',{},signal);
    const conversation=intent.explicit?((intent.conversationId&&inbox.snapshot.conversations.find(c=>c.id===intent.conversationId))||[...inbox.snapshot.conversations].filter(c=>c.unreadCount>0).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id))[0]):undefined;
    const result=conversation?await api<ConversationPageResult>('open',{conversationId:conversation.id},signal):inbox;
    if(signal.aborted||generation!==request.current.id)return;
    request.current.controller?.abort();request.current.id++;
    live.current.targetId=conversation?.id;setTargetId(conversation?.id);olderAttempt.current='';
    setAttachmentTarget(undefined);scrollPlan.current={mode:'bottom'};
    setSnapshot(result.snapshot);setPage(conversation?result.page:undefined);setError('');
    if(new URLSearchParams(location.hash.slice(1)).has('conversation'))history.replaceState(null,'',location.pathname+location.search);
    if(conversation){enterChat(conversation.id);}else{if(history.state?.messengerChat)history.replaceState(null,'');viewOpen.current=false;setChatOpen(false);}
  }
  //: Автоматически перечитывает изменившийся кеш без ожидания MTProto.
  //: Сохраняет старые страницы и не прерывает явный выбор или прокрутку.
  async function updateFromCache(revision:number,reconnecting=false){
    if(live.current.pending||cacheUpdate.current)return;cacheUpdate.current=true;
    const id=live.current.targetId;const generation=request.current.id;
    try{
      const result=await api<ConversationPageResult>(id?'open':'inbox',id?{conversationId:id}:{});
      const state=result.snapshot;
      if(generation!==request.current.id||id!==live.current.targetId||live.current.pending)return;
      preserveFeedPosition(true);
      setSnapshot(state);
      if(result)setPage(old=>{
        const fresh=result.page;if(!old||old.conversationId!==fresh.conversationId)return fresh;
        if(!fresh.messages.length)return fresh;
        const boundary=fresh.messages[0];const older=old.messages.filter(m=>m.date<boundary.date||(m.date===boundary.date&&m.id<boundary.id));
        return {...fresh,messages:[...older,...fresh.messages],oldestCursor:older.length?old.oldestCursor:fresh.oldestCursor,nextCursor:older.length?(old.nextCursor||(reconnecting||!fresh.historyComplete?old.oldestCursor||null:null)):fresh.nextCursor};
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
  //: Запоминает видимую позицию перед обновлением сообщений.
  //: При обновлении свежей страницы лента следует за концом, если читатель находится внизу.
  function preserveFeedPosition(followBottom=false){
    const element=feed.current;if(!element)return;
    if(followBottom&&element.scrollHeight-element.scrollTop-element.clientHeight<=1){scrollPlan.current={mode:'bottom'};return;}
    const top=element.getBoundingClientRect().top;
    const anchor=[...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(node=>node.getBoundingClientRect().bottom>top);
    scrollPlan.current={mode:'preserve',height:element.scrollHeight,top:element.scrollTop,...(anchor?{anchor:{id:anchor.dataset.messageId!,offset:anchor.getBoundingClientRect().top-top}}:{})};
  }
  //: Показывает сохранённую первую страницу и запрашивает актуальные сообщения или более раннюю страницу.
  //: Переход и изменение доступа отменяют оба результата, догрузка сохраняет позицию прокрутки.
  async function loadView(conversation?:Conversation,older=false){
    if(busy)return;
    const before=older&&page&&page.conversationId===(conversation?.id||'inbox')?page.nextCursor:undefined;
    if(older&&!before)return;
    request.current.controller?.abort();const controller=new AbortController();const id=++request.current.id;request.current.controller=controller;
    const revision=access.current.revision;live.current.pending=true;setLoading(true);setError('');
    try{
      let showedCache=false;
      if(!older){
        const saved=await readCachedPage(conversation?.id);
        if(id!==request.current.id||revision!==access.current.revision)return;
        const allowed=access.current.ids;
        const cachedMessages=saved?.page.messages.filter(message=>!allowed||allowed.has(message.conversationId));
        if(saved&&cachedMessages?.length){
          scrollPlan.current={mode:'bottom'};
          setPage({...saved.page,messages:cachedMessages});
          showedCache=true;
          if(navigator.onLine===false)return;
        }
      }
      const result=await api<ConversationPageResult>(conversation?(older?'older':'open'):'inbox',{...(conversation?{conversationId:conversation.id}:{}),...(before?{before}:{})},controller.signal);
      if(id!==request.current.id||revision!==access.current.revision)return;
      if(older||showedCache)preserveFeedPosition(!older);else scrollPlan.current={mode:'bottom'};
      setSnapshot(result.snapshot);
      setPage(old=>older&&old?.conversationId===result.page.conversationId?{...result.page,messages:[...new Map([...old.messages,...result.page.messages].map(m=>[m.id,m])).values()].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))}:result.page);

    }catch(e){
      if(id!==request.current.id||controller.signal.aborted)return;
      if(e instanceof ApiError&&(e.status===403||e.status===404))setPage(undefined);
      fail(e);
    }
    finally{if(id===request.current.id){live.current.pending=false;setLoading(false);}}
  }
  //: Выбирает адресата и подгружает его последние сообщения.
  //: Сохраняет раздельные черновики и открывает отдельный экран переписки.
  async function choose(c: Conversation,push=true) {
    if (busy) return;
    arrival.cancel();
    live.current.targetId=c.id;olderAttempt.current='';setTargetId(c.id);setPage(undefined);enterChat(c.id,push);await loadView(c);
  }
  //: Открывает экран переписки с отдельной записью истории браузера.
  //: Переключение адресата заменяет текущую запись, кнопка назад ведёт к списку.
  function enterChat(id:string,push=true){
    if(push){const state={messengerChat:true,conversationId:id};if(history.state?.messengerChat)history.replaceState(state,'');else history.pushState(state,'');}
    viewOpen.current=true;setChatOpen(true);
  }
  //: Возвращает к списку, отменяя поздние переходы и чтение скрытой ленты.
  //: Черновики, поисковая строка и прокрутка списка сохраняются в памяти.
  function showList(){
    arrival.cancel();cancelView();live.current.targetId=undefined;viewOpen.current=false;setChatOpen(false);setTargetId(undefined);setPage(undefined);setAttachmentTarget(undefined);
  }
  //: Обрабатывает кнопку назад без выхода со страницы Messenger.
  //: У открытого уведомлением чата также есть собственная запись истории.
  function backToList(){if(busy)return;if(history.state?.messengerChat)history.back();else showList();}
  //: Открывает общую ленту отдельным действием из списка чатов.
  //: Общее поле ввода остаётся заблокированным до выбора точного адресата.
  async function openInbox(push=true){
    if(busy)return;arrival.cancel();cancelView();live.current.targetId=undefined;setTargetId(undefined);setPage(undefined);enterChat('inbox',push);await loadView();
  }
  //: Фиксирует текст и Destination, затем создаёт уникальный request ID.
  //: Очищает только отправленный черновик; ошибка требует ручной сверки ленты.
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!target || !draft.trim() || pending || uncertain || offline) return;
    const destination = destinationFor(target);
    const text = draft;
    setBusy(true); setError('');
    try {
      const message = await api<Message>('send', { destination, text, requestId: crypto.randomUUID() });
      scrollPlan.current={mode:'bottom'};
      setSnapshot(old => old ? { ...old, conversations: old.conversations.map(c => c.id === message.conversationId ? { ...c, preview:messagePreview(message),previewMessageId:message.id, updatedAt:message.date } : c), messages: [...old.messages.filter(m => m.id !== message.id), message].sort((a,b) => a.date.localeCompare(b.date)).slice(-LIMITS.pageMessages) } : old);
      setPage(old=>old?.conversationId===message.conversationId?{...old,messages:[...old.messages.filter(m=>m.id!==message.id),message].sort((a,b)=>a.date.localeCompare(b.date))}:old);
      setDrafts(old => ({ ...old, [destination.conversationId]: '' }));
    } catch (e) { uncertainAt.current=Date.now();setUncertain(true);fail(e); } finally { setBusy(false); }
  }
  //: Отправляет явную отметку прочитанного для выбранного диалога.
  //: Снимок заменяется только после ответа API.
  async function read() {
    if (!target||offline) return;
    setBusy(true); setError('');
    try { setSnapshot(await api<Snapshot>('read', { conversationId: target.id })); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  //: Отзывает текущую веб-сессию и очищает состояние переписки UI.
  //: Не завершает Telegram-авторизацию на сервере.
  async function logout() {
    arrival.cancel();clearPreviews();clearAvatars();setChatOpen(false);viewOpen.current=false;if(history.state?.messengerChat)history.replaceState(null,'');setAttachmentTarget(undefined);cancelView();setBusy(true);
    try {
      await api('logout', {pushEndpoint:await notificationEndpoint()});void unsubscribeNotifications().catch(()=>{});acceptSession({ authenticated: false, setupRequired: false });
      setSnapshot(undefined);setPage(undefined);setDrafts({});setTargetId(undefined);setError('');setUncertain(false);seenRevision.current=0;appliedRevision.current=0;access.current={revision:0};
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (!session || !session.authenticated) return <main className="entry">
    <div className="entry-brand"><Brand /><AppUpdates updates={updates} busy={busy} hasDrafts={false}/></div>
    <section className="login-card">
      <h1>Вход</h1>
      {session?.account&&<p className="account-name">{session.account.displayName} · @{session.account.username}</p>}
      {!session ? <p role="status">{error || 'Подключение к серверу…'}</p> : session.setupRequired ? <p role="status">Вход ещё не настроен.</p> : <form onSubmit={login} className="login-form">
        <label htmlFor="password">Пароль</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={512} autoFocus />
        <button className="primary" disabled={busy}>{busy ? 'Вход…' : 'Войти в Messenger'}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>}
    </section>
  </main>;

  const conversations=snapshot?.conversations.filter(c=>(!onlyUnread||c.unreadCount>0)&&c.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort(compareConversations)||[];
  return <main className={`workspace ${chatOpen?'chat-screen':'list-screen'}`}>
    <aside className="sidebar" aria-label="Чаты" hidden={chatOpen}>
      <header className="list-header"><a href={`${appBase}/admin`} className="settings-link" aria-disabled={offline} onClick={e=>{if(offline)e.preventDefault();}}>Настройки</a><div><h1>Чаты</h1><p role="status">{offline?'Без сети · сохранённые сообщения':arrival.opening&&!snapshot?'Соединение…':syncStatus?.pausedUntil?'Синхронизация приостановлена':preparation.pending?`Сохраняются чаты: ${preparation.ready}/${preparation.total}`:connected?'Подключено':'Нет подключения'}</p></div><button className="icon-button inbox-button" aria-label="Общая лента" disabled={busy} onClick={()=>void openInbox()}><Icon name="inbox" /></button></header>
      <label className="search"><Icon name="search" /><input aria-label="Поиск диалогов" placeholder="Поиск" value={query} onChange={e=>setQuery(e.target.value)} /></label>
      <div className="chat-filters" role="group" aria-label="Фильтр чатов"><button aria-pressed={!onlyUnread} onClick={()=>setOnlyUnread(false)}>Все</button><button aria-pressed={onlyUnread} onClick={()=>setOnlyUnread(true)}>Непрочитанные{unread>0&&<span>{unread}</span>}</button></div>
      {error&&<div className="error-banner" role="alert">{error}</div>}
      <nav className="conversation-list" aria-label="Получатели" aria-busy={!snapshot}>
        {conversations.map(c=><button key={c.id} className="conversation" disabled={busy} onClick={()=>void choose(c)}>
          <Avatar conversation={c} paused={offline} onUnauthorized={fail}/>
          <span className="conversation-copy"><span className="conversation-title"><span className="conversation-name" title={c.title}>{c.title}</span><time dateTime={c.updatedAt}>{c.updatedAt&&conversationTime(c.updatedAt)}</time></span><span className="preview"><span className="conversation-source" data-source-kind={snapshot?.sources.find(s=>s.id===c.sourceId)?.kind}>{snapshot?.sources.find(s=>s.id===c.sourceId)?.name||'Источник'}</span>{drafts[c.id]?<><span className="draft-caption">Черновик: </span>{drafts[c.id]}</>:c.preview||(Date.parse(c.updatedAt)>0?'Загрузка сообщения…':'Нет сообщений')}</span></span>
          {c.unreadCount>0&&<span className="badge" aria-label={`${c.unreadCount} непрочитанных`}>{c.unreadCount}</span>}
        </button>)}
        {!conversations.length&&<p className="list-empty">{!snapshot?'Загрузка чатов…':query.trim()?'Чаты не найдены':onlyUnread?'Нет непрочитанных чатов':'Здесь появятся ваши диалоги после подключения аккаунта и выбора в админке.'}</p>}
      </nav>
      {!offline&&<Notifications />}
      <div className="sidebar-footer"><span>{session.account?.displayName||'Messenger'} · {unread} непрочитанных</span><div className="footer-actions"><AppUpdates updates={updates} busy={pending||!!attachmentTarget} hasDrafts={Object.values(drafts).some(Boolean)}/><button className="icon-button" aria-label="Выйти" onClick={logout} disabled={busy}><Icon name="logout" /></button></div></div>
    </aside>
    <section className="chat" aria-label="Единая лента сообщений" hidden={!chatOpen}>
      <header className="chat-header"><button className="back-button" aria-label="Назад к чатам" disabled={busy} onClick={backToList}><Icon name="back"/><span>Чаты</span></button><div className="chat-heading"><div className="header-title"><h1>{target?.title||'Общая лента'}</h1></div><p>{target?snapshot?.sources.find(s=>s.id===target.sourceId)?.name:`${unread} непрочитанных`}</p></div>{target&&<Avatar key={target.id} conversation={target} paused={offline} onUnauthorized={fail}/>}</header>
      <div className="feed-info"><span className={`status-dot ${offline?'offline-dot':''}`} />{offline?'Без сети · сохранённые сообщения':syncStatus?.pausedUntil?'Синхронизация временно приостановлена':syncStatus?.pendingConversations?'История синхронизируется в фоне':'Автоматическая синхронизация'}<span className="feed-limit">{offline?'Кеш этого устройства':'Сообщения из локального кеша'}</span></div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="feed" ref={feed} tabIndex={0} aria-label="Сообщения" aria-busy={pending&&!messages.length}>
        <div ref={sentinel} className="history-sentinel" aria-hidden="true" />
        {!messages.length ? <div className="empty-state"><h2>{loading?'Загрузка сообщений…':offline?'В этом чате ещё нет сохранённых сообщений':'Нет загруженных сообщений'}</h2></div> : <div className="message-stream">{messages.map((m,i,messages) => {
          const c = snapshot?.conversations.find(c => c.id === m.conversationId);
          const voice=m.attachments.find(a=>a.kind==='audio'&&a.isVoice&&a.downloadable!==false);
          return <div key={m.id}>{(i === 0 || day(messages[i-1].date) !== day(m.date)) && <div className="date-divider"><span>{day(m.date)}</span></div>}
            <article data-message-id={m.id} className={`message ${m.outgoing ? 'outgoing' : ''}`} aria-label={`Сообщение: ${m.sender.name}`}>
              <div className="bubble">
                {!target&&<div className="message-context"><strong>{c?.title || 'Диалог'}</strong><span className="source-label">{snapshot?.sources.find(s => s.id === m.sourceId)?.name || 'Источник'}</span></div>}
                {!m.outgoing && c?.kind === 'group' && <strong className="sender-name">{m.sender.name}</strong>}
                {m.text && <p>{m.text}</p>}{m.attachments.map(a => a.downloadable===false?<div key={a.id} className="attachment">{a.name}</div>:<AttachmentPreview key={a.id} attachment={a} request={{conversationId:m.conversationId,messageId:m.id,attachmentId:a.id}} version={m.editedAt||m.date} paused={offline||!!attachmentTarget} onOpen={()=>{if(offline)setError('Для загрузки вложения нужна связь.');else setAttachmentTarget({conversationId:m.conversationId,messageId:m.id,attachmentId:a.id});}} onUnauthorized={fail}/>)}
                {voice&&chatOpen&&<VoiceTranscription key={m.editedAt||m.date} request={{conversationId:m.conversationId,messageId:m.id,attachmentId:voice.id}} value={m.voiceTranscription} offline={offline} onUnauthorized={fail}/>}
                <div className="message-meta">{!target&&c?.canSend&&<button className="reply-button" disabled={busy} onClick={() => choose(c)}>Ответить <span aria-hidden="true">↗</span></button>}<time dateTime={m.date}>{time(m.date)}</time>{m.outgoing && <span aria-label="Отправлено">✓</span>}</div>
              </div>
            </article></div>;
        })}</div>}
      </div>
      <div className="composer-area">
        <div className="destination">{target ? <><span className="destination-recipient" title={target.title}>Кому: <strong>{target.title}</strong><span className="destination-source"> · {snapshot?.sources.find(s => s.id === target.sourceId)?.name}</span></span><button disabled={busy} onClick={backToList}>Изменить</button></> : <><span>Адресат не выбран</span><button onClick={backToList}>Выбрать <span aria-hidden="true">↗</span></button></>}</div>
        <form className="composer" onSubmit={send}><textarea ref={composerInput} aria-label="Сообщение" placeholder={offline?'Для отправки нужна связь':target ? target.canSend ? 'Написать сообщение…' : 'Этот диалог доступен только для чтения' : 'Сначала выберите адресата'} rows={1} value={draft} maxLength={LIMITS.text} disabled={!target?.canSend || busy || pending&&!messages.length || offline} onChange={e => target && setDrafts(old => ({ ...old, [target.id]: e.target.value }))} /><button className="send-button" type="submit" aria-label={target ? `Отправить: ${target.title}` : 'Отправить сообщение'} disabled={!target?.canSend || !draft.trim() || pending || uncertain || offline}><Icon name="send" /></button></form>
        {(uncertain||(target&&target.unreadCount>0&&snapshot?.sources.find(s=>s.id===target.sourceId)?.canMarkRead!==false)||draft.length>3500)&&<div className="composer-note">{uncertain && <span>Дождитесь синхронизации и проверьте отправку перед повтором</span>}{target && target.unreadCount > 0 && snapshot?.sources.find(s=>s.id===target.sourceId)?.canMarkRead!==false && <button disabled={pending||offline} onClick={read}>Отметить прочитанным</button>}{draft.length > 3500 && <span>{draft.length}/{LIMITS.text}</span>}</div>}
      </div>
    </section>
    {attachmentTarget&&<AttachmentViewer key={`${attachmentTarget.messageId}/${attachmentTarget.attachmentId}`} request={attachmentTarget} onClose={()=>setAttachmentTarget(undefined)} onUnauthorized={fail}/>}
  </main>;
}
