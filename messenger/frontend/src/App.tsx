import { useEffect, useRef, useState, type FormEvent } from 'react';
import { destinationFor, LIMITS, type Conversation, type Message, type SessionInfo, type Snapshot } from '../../shared/types';
import { api, ApiError, setCsrf } from './api';

//: Форматирует время сообщения для интерфейса.
//: Использует локаль ru-RU и часовой пояс браузера.
const time = (date: string) => new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
//: Форматирует подпись календарной даты в ленте.
//: Использует локаль ru-RU и часовой пояс браузера.
const day = (date: string) => new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
//: Выбирает локальный SVG для рабочей кнопки.
//: Не загружает внешние изображения или скрипты.
function Icon({ name }: { name: 'send' | 'refresh' | 'menu' | 'close' | 'search' | 'logout' }) {
  const paths = { send: 'm4 4 17 8-17 8 3-8-3-8m3 8h14', refresh: 'M20 8a8 8 0 1 0 0 8M20 3v5h-5', menu: 'M4 6h16M4 12h16M4 18h16', close: 'm6 6 12 12M18 6 6 18', search: 'm15 15 5 5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', logout: 'M9 4H4v16h5m6-13 5 5-5 5M8 12h12' };
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [targetId, setTargetId] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const target = snapshot?.conversations.find(c => c.id === targetId);
  const draft = target ? drafts[target.id] || '' : '';
  const unread = snapshot?.conversations.reduce((n,c) => n + c.unreadCount, 0) || 0;
  const connected = snapshot?.sources.some(s => s.connected);

  //: Применяет состояние веб-входа и CSRF в памяти.
  //: Не читает и не получает Telegram credentials.
  const acceptSession = (info: SessionInfo) => { setCsrf(info.csrfToken || ''); setSession(info); };
  //: Показывает ошибку операции и обрабатывает потерю входа.
  //: При 401 очищает снимок, адресата и черновики.
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) { acceptSession({ authenticated: false, setupRequired: false }); setSnapshot(undefined); setDrafts({}); setTargetId(undefined); }
    setError(e instanceof Error ? e.message : 'Нет связи с локальным сервером.');
  }
  useEffect(() => { api<SessionInfo>('session').then(acceptSession).catch(fail); }, []);
  useEffect(() => {
    if (session?.authenticated) api<Snapshot>('snapshot').then(setSnapshot).catch(fail);
  }, [session?.authenticated]);
  useEffect(() => {
    if (!session?.authenticated) return;
    let disposed = false;
    //: Применяет изменения разрешённых диалогов к уже открытой вкладке.
    //: Проверяет только ID раз в пять секунд, не загружая историю сообщений.
    async function checkAccess() {
      try {
        const result = await api<{ ids: string[] }>('access');
        if (disposed) return;
        const ids = new Set(result.ids);
        setSnapshot(old => old ? { ...old, conversations: old.conversations.filter(c => ids.has(c.id)), messages: old.messages.filter(m => ids.has(m.conversationId)) } : old);
        setTargetId(old => old && ids.has(old) ? old : undefined);
        setDrafts(old => Object.fromEntries(Object.entries(old).filter(([id]) => ids.has(id))));
      } catch (e) { if (!disposed) fail(e); }
    }
    void checkAccess();
    const timer = window.setInterval(checkAccess, 5000);
    document.addEventListener('visibilitychange', checkAccess);
    return () => { disposed = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', checkAccess); };
  }, [session?.authenticated]);
  useEffect(() => { if (feed.current) feed.current.scrollTop = feed.current.scrollHeight; }, [snapshot?.messages.length]);
  useEffect(() => {
    if (!drawer) return;
    //: Закрывает мобильный список по Escape.
    //: Listener снимается cleanup-функцией эффекта.
    const listener = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [drawer]);
  //: Отправляет пароль локальному API и принимает новую сессию.
  //: После успеха очищает поле пароля, во время запроса блокирует повтор.
  async function login(e: FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try { acceptSession(await api<SessionInfo>('login', { password })); setPassword(''); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  //: Обновляет общую ленту по явному действию.
  //: Успешный ответ снимает блокировку после неизвестной отправки.
  async function refresh() {
    setBusy(true); setError('');
    try { setSnapshot(await api<Snapshot>('refresh', {})); setUncertain(false); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  //: Выбирает адресата и подгружает его последние сообщения.
  //: Сохраняет раздельные черновики, закрывает мобильную панель.
  async function choose(c: Conversation) {
    if (busy) return;
    setTargetId(c.id); setDrawer(false); setBusy(true); setError('');
    try { setSnapshot(await api<Snapshot>('open', { conversationId: c.id })); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  //: Фиксирует текст и Destination, затем создаёт уникальный request ID.
  //: Очищает только отправленный черновик; ошибка требует ручной сверки ленты.
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!target || !draft.trim() || busy || uncertain) return;
    const destination = destinationFor(target);
    const text = draft;
    setBusy(true); setError('');
    try {
      const message = await api<Message>('send', { destination, text, requestId: crypto.randomUUID() });
      setSnapshot(old => old ? { ...old, conversations: old.conversations.map(c => c.id === message.conversationId ? { ...c, preview:message.text, updatedAt:message.date } : c), messages: [...old.messages.filter(m => m.id !== message.id), message].sort((a,b) => a.date.localeCompare(b.date)) } : old);
      setDrafts(old => ({ ...old, [destination.conversationId]: '' }));
    } catch (e) { setUncertain(true); fail(e); } finally { setBusy(false); }
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
    setBusy(true);
    try {
      await api('logout', {}); acceptSession({ authenticated: false, setupRequired: false });
      setSnapshot(undefined); setDrafts({}); setTargetId(undefined); setError('');
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
      <button className={`all-row ${!target ? 'active' : ''}`} disabled={busy} onClick={() => { setTargetId(undefined); setDrawer(false); }}><span className="all-symbol">≋</span><span>Общая лента</span>{unread > 0 && <b className="badge" aria-label={`${unread} непрочитанных`}>{unread}</b>}</button>
      <div className="list-label">ВЫБРАТЬ АДРЕСАТА</div>
      <nav className="conversation-list" aria-label="Получатели">
        {snapshot?.conversations.filter(c => c.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((c,i) => <button key={c.id} className={`conversation ${target?.id === c.id ? 'selected' : ''}`} disabled={busy} onClick={() => choose(c)} aria-pressed={target?.id === c.id}>
          <span className={`avatar tone-${i % 4}`}>{c.title.slice(0,1).toUpperCase()}</span>
          <span className="conversation-copy"><span className="conversation-title">{c.title}<time>{c.updatedAt && time(c.updatedAt)}</time></span><span className="preview">{c.preview || (c.kind === 'group' ? 'Группа' : 'Личный диалог')}</span><span className="source-caption">{snapshot.sources.find(s => s.id === c.sourceId)?.name}</span></span>
          {c.unreadCount > 0 && <span className="badge">{c.unreadCount}</span>}
        </button>)}
        {!snapshot?.conversations.length && <p className="list-empty">Здесь появятся ваши диалоги после подключения аккаунта и обновления.</p>}
      </nav>
      <div className="sidebar-footer"><span><i className={`status-dot ${connected ? '' : 'muted'}`} />{unread} непрочитанных</span><button className="icon-button" aria-label="Выйти" onClick={logout} disabled={busy}><Icon name="logout" /></button></div>
    </aside>
    <section className="chat" aria-label="Единая лента сообщений">
      <header className="chat-header"><button className="icon-button mobile-only" aria-label="Открыть диалоги" onClick={() => setDrawer(true)}><Icon name="menu" /></button><div><div className="header-title"><h1>Общая лента</h1></div><p>{unread} непрочитанных</p></div><button className="refresh-button" onClick={refresh} disabled={busy}><Icon name="refresh" /><span>{busy ? 'Подождите…' : 'Обновить'}</span></button></header>
      <div className="feed-info"><span className="status-dot" />{snapshot?.stale ? 'Кеш · нажмите «Обновить» для актуальных сообщений' : snapshot?.refreshedAt ? `Обновлено в ${time(snapshot.refreshedAt)} · вручную` : 'Обновление по вашему запросу'}<span className="feed-limit">Только последние сообщения</span></div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="feed" ref={feed} tabIndex={0} aria-label="Сообщения" aria-busy={busy}>
        {!snapshot?.messages.length ? <div className="empty-state"><h2>Нет загруженных сообщений</h2><button className="primary" onClick={refresh} disabled={busy}>Обновить сообщения <Icon name="refresh" /></button></div> : <div className="message-stream">{snapshot.messages.map((m,i,messages) => {
          const c = snapshot.conversations.find(c => c.id === m.conversationId);
          return <div key={m.id}>{(i === 0 || day(messages[i-1].date) !== day(m.date)) && <div className="date-divider"><span>{day(m.date)}</span></div>}
            <article className={`message ${m.outgoing ? 'outgoing' : ''}`} aria-label={`Сообщение: ${m.sender.name}`}>
              <div className="message-context"><strong>{c?.title || 'Диалог'}</strong><span className="source-label">↗ {snapshot.sources.find(s => s.id === m.sourceId)?.name || 'Источник'}</span></div>
              <div className="bubble">{!m.outgoing && c?.kind === 'group' && <strong className="sender-name">{m.sender.name}</strong>}{m.text && <p>{m.text}</p>}{m.attachments.map(a => <div key={a.id} className="attachment">{a.name}</div>)}<div className="message-meta"><time dateTime={m.date}>{time(m.date)}</time>{m.outgoing && <span aria-label="Отправлено">✓</span>}</div></div>
              {c?.canSend && <button className="reply-button" disabled={busy} onClick={() => choose(c)}>Ответить <span aria-hidden="true">↗</span></button>}
            </article></div>;
        })}</div>}
      </div>
      <div className="composer-area">
        <div className="destination">{target ? <><span>Кому: <strong>{target.title}</strong><span className="destination-source"> · {snapshot?.sources.find(s => s.id === target.sourceId)?.name}</span></span><button disabled={busy} onClick={() => setDrawer(true)}>Изменить</button></> : <><span>Выберите адресата, чтобы начать разговор</span><button onClick={() => setDrawer(true)}>Выбрать <span aria-hidden="true">↗</span></button></>}</div>
        <form className="composer" onSubmit={send}><textarea aria-label="Сообщение" placeholder={target ? target.canSend ? 'Написать сообщение…' : 'Этот диалог доступен только для чтения' : 'Сначала выберите адресата'} rows={2} value={draft} maxLength={LIMITS.text} disabled={!target?.canSend || busy} onChange={e => target && setDrafts(old => ({ ...old, [target.id]: e.target.value }))} /><button className="send-button" type="submit" aria-label={target ? `Отправить: ${target.title}` : 'Отправить сообщение'} disabled={!target?.canSend || !draft.trim() || busy || uncertain}><Icon name="send" /></button></form>
        <div className="composer-note">{uncertain && <span>Перед повторной отправкой обновите ленту</span>}{target && target.unreadCount > 0 && <button disabled={busy} onClick={read}>Отметить прочитанным</button>}{draft.length > 3500 && <span>{draft.length}/{LIMITS.text}</span>}</div>
      </div>
    </section>
  </main>;
}
