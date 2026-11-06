import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatSnapshot, Conversation, Health } from '../../shared/types';
import { api } from './api';

const statusText = { ready: 'Готов к диалогу', thinking: 'Думает', acting: 'Выполняет действие', error: 'Ошибка' };
function savedSelection() { try { return localStorage.getItem('codex-z-ai:thread'); } catch { return null; } }
function MessageText({ text }: { text: string }) {
  return <>{text.split(/```/g).map((part, i) => i % 2
    ? <pre key={i}><code>{part.replace(/^[\w+-]*\n/, '')}</code></pre>
    : <span className="prose" key={i}>{part}</span>)}</>;
}
function Arrow() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>; }
function ChatIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 1-8 8H4l1.5-4A8 8 0 1 1 20 11Z" /></svg>; }

export function App() {
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(savedSelection);
  const [snapshot, setSnapshot] = useState<ChatSnapshot | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [retry, setRetry] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);

  async function refreshThreads() { setThreads(await api<Conversation[]>('/threads')); }
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const response = await fetch('/api/health');
        const result = await response.json() as Health;
        if (alive) setHealth(result);
      } catch { if (alive) setHealth({ status: 'error', codex: 'disconnected', sandbox: 'read-only', model: null, error: 'Backend недоступен. Проверьте, запущено ли приложение.' }); }
    };
    void check();
    void refreshThreads().catch((e: Error) => { if (alive) setError(e.message); });
    const timer = setInterval(() => { void check(); }, 10_000);
    return () => { alive = false; clearInterval(timer); };
  }, [retry]);

  useEffect(() => {
    setSnapshot(null); setError(null); setConnected(false);
    nearBottom.current = true;
    try {
      if (selected) localStorage.setItem('codex-z-ai:thread', selected);
      else localStorage.removeItem('codex-z-ai:thread');
    } catch { /* Storage can be unavailable in private browser modes. */ }
    if (!selected) { setLoading(false); return; }
    setLoading(true);
    let cancelled = false;
    let source: EventSource | undefined;
    // Read once to surface useful HTTP errors before opening the event stream.
    void api<ChatSnapshot>(`/threads/${selected}`).then((value) => {
      if (cancelled) return;
      setSnapshot(value); setLoading(false);
      source = new EventSource(`/api/threads/${selected}/events`);
      source.addEventListener('snapshot', (event) => {
        if (cancelled) return;
        setSnapshot(JSON.parse((event as MessageEvent).data)); setConnected(true); setLoading(false);
      });
      source.onopen = () => { if (!cancelled) setConnected(true); };
      source.onerror = () => { if (!cancelled) setConnected(false); };
    }).catch((e: Error) => { if (!cancelled) { setLoading(false); setError(e.message); } });
    return () => { cancelled = true; source?.close(); };
  }, [selected, retry]);

  useEffect(() => {
    if (nearBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [snapshot]);
  useEffect(() => {
    if (!input.current) return;
    input.current.style.height = 'auto';
    input.current.style.height = `${Math.min(input.current.scrollHeight, 160)}px`;
  }, [draft]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  const active = Boolean(snapshot?.activeTurnId);
  const online = health?.codex === 'connected';
  const current = threads.find((t) => t.id === selected);
  const status = pending ? 'thinking' : snapshot?.status || 'ready';
  async function newConversation() {
    setPending(true); setError(null);
    try {
      const thread = await api<Conversation>('/threads', {});
      await refreshThreads(); setSelected(thread.id); setDrawer(false); setDraft('');
    } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || pending || active || !online || (selected && !connected)) return;
    setPending(true); setError(null);
    try {
      let id = selected;
      if (!id) {
        const thread = await api<Conversation>('/threads', {});
        id = thread.id; setSelected(id);
      }
      await api(`/threads/${id}/messages`, { text: draft });
      setDraft(''); await refreshThreads();
    } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  async function stop() {
    if (!selected) return;
    setStopping(true);
    try { await api(`/threads/${selected}/interrupt`, {}); }
    catch (e) { setError((e as Error).message); }
    finally { setStopping(false); }
  }
  async function loadOlder() {
    if (!selected) return;
    setPending(true);
    try { nearBottom.current = false; setSnapshot(await api<ChatSnapshot>(`/threads/${selected}/older`, {})); }
    catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }

  return <div className="app-shell">
    {drawer && <button className="backdrop" aria-label="Закрыть список диалогов" onClick={() => setDrawer(false)} />}
    <aside className={`sidebar ${drawer ? 'is-open' : ''}`} aria-label="Диалоги">
      <a className="brand" href="/" onClick={(e) => { e.preventDefault(); setSelected(null); setDrawer(false); }}><span className="brand-mark">Z</span><span>Codex Z AI<small>Ваш локальный помощник</small></span></a>
      <button className="new-chat" onClick={() => void newConversation()} disabled={pending || !online}><span>＋</span> Новый диалог</button>
      <div className="history-heading">ДИАЛОГИ <span>{threads.length.toString().padStart(2, '0')}</span></div>
      <nav className="history-list" aria-label="История диалогов">
        {threads.map((thread) => <button className={`history-item ${selected === thread.id ? 'selected' : ''}`} key={thread.id} onClick={() => { setSelected(thread.id); setDrawer(false); }}>
          <ChatIcon /><span>{thread.title}<small>{new Date(thread.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</small></span>
        </button>)}
        {!threads.length && <p className="history-empty">Здесь появятся ваши диалоги.<br />К ним можно вернуться позже.</p>}
      </nav>
      <div className="sidebar-footer"><span className="local-dot" /><div>Только на этом Mac<small>Локальное подключение · 127.0.0.1</small></div></div>
    </aside>
    <main>
      <header className="topbar">
        <button className="menu-button icon-button" aria-label={drawer ? 'Закрыть диалоги' : 'Открыть диалоги'} aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>☰</button>
        <div className="conversation-heading"><strong>{current?.title || 'Новый диалог'}</strong><span>Codex <span className="model-name">{health?.model ? `· ${health.model}` : '· установлен на MacBook'}</span></span></div>
        <span className="readonly"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6l-8-3Z" /><path d="m8 12 3 3 5-6" /></svg>Только чтение</span>
      </header>
      <div className="chat-scroll" ref={scroll} onScroll={() => { if (scroll.current) nearBottom.current = scroll.current.scrollHeight - scroll.current.scrollTop - scroll.current.clientHeight < 100; }}>
        <div className="chat-content">
          {!online && health && <div className="alert" role="alert"><strong>Нет подключения к Codex</strong><p>{health.error || 'Подключение ещё устанавливается.'}</p><button onClick={() => setRetry((v) => v + 1)}>Проверить снова</button></div>}
          {error && <div className="alert" role="alert"><p>{error}</p><button onClick={() => setRetry((v) => v + 1)}>Повторить подключение</button><button onClick={() => { setSelected(null); setError(null); }}>К новому диалогу</button></div>}
          {loading && <p className="loading" role="status">Восстанавливаем диалог…</p>}
          {!loading && !snapshot?.messages.length && !error && <section className="welcome">
            <div className="welcome-mark">Z<span /></div>
            <div className="eyebrow">ПРОСТРАНСТВО ДЛЯ ВАШИХ ИДЕЙ</div>
            <h1>С чего начнём?</h1>
            <p>Обсудите идею, разберитесь в сложном<br className="desktop-break" /> или найдите следующий шаг вместе с Codex.</p>
            <div className="suggestions">{['Помоги обдумать идею', 'Объясни простыми словами', 'Составим план на день'].map((text, i) => <button key={text} onClick={() => { setDraft(`${text}: `); input.current?.focus(); }}><span>{['✧', '⌘', '↗'][i]}</span>{text}<span className="suggestion-arrow">↗</span></button>)}</div>
          </section>}
          {snapshot?.olderCursor && <button className="older-button" onClick={() => void loadOlder()} disabled={pending}>Показать более ранние сообщения</button>}
          <div className="messages" aria-label="Сообщения диалога" aria-busy={active}>
            {snapshot?.messages.map((message) => <article key={message.id} className={`message ${message.role}`}>
              <div className="message-avatar">{message.role === 'assistant' ? 'Z' : 'Вы'}</div>
              <div className="message-body"><div className="message-author">{message.role === 'assistant' ? 'Codex' : 'Вы'}</div><div className="message-text"><MessageText text={message.text} />{!message.text && active && <span className="thinking-dots">•••</span>}</div></div>
            </article>)}
          </div>
          {snapshot?.error && <div className="alert" role="alert">{snapshot.error}</div>}
          {snapshot?.notice && <p className="notice" role="status">{snapshot.notice}</p>}
          {Boolean(snapshot?.events.length) && <details className="technical"><summary>Технические события <span>{snapshot!.events.length}</span></summary><div className="technical-list">{snapshot!.events.map((event) => <section key={event.id}><div><strong>{event.label}</strong><small>{event.status}</small></div><pre>{event.detail || 'Событие завершено'}</pre></section>)}</div></details>}
        </div>
      </div>
      <div className="composer-area">
        <div className="composer-meta"><span className={`status-dot ${!online || status === 'error' ? 'offline' : active || pending ? 'working' : ''}`} /><span role="status" aria-live="polite">{!online ? 'Codex не подключён' : selected && !connected ? 'Подключаем диалог…' : statusText[status]}{active && <span className="animated-ellipsis">…</span>}</span><span className="connection-note">{selected && !connected && !loading ? 'Восстанавливаем соединение' : 'App Server · stdio'}</span></div>
        <form className="composer" onSubmit={(e) => void send(e)}>
          <textarea ref={input} aria-label="Сообщение для Codex" placeholder="Напишите Codex…" value={draft} maxLength={16_000} rows={1} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !window.matchMedia('(pointer: coarse)').matches) { e.preventDefault(); void send(e); } }} />
          {active ? <button type="button" className="send-button stop-button" aria-label="Остановить ответ" title="Остановить ответ" disabled={stopping} onClick={() => void stop()}><span /></button> : <button className="send-button" type="submit" aria-label="Отправить сообщение" title="Отправить сообщение" disabled={!draft.trim() || pending || !online || loading || Boolean(selected && !connected)}><Arrow /></button>}
        </form>
        <p className="composer-footnote">Контекст сохраняется в Codex<span>·</span>Персональная память — на следующем этапе</p>
      </div>
    </main>
  </div>;
}
