import { EventEmitter } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChatSnapshot, Conversation } from '../../shared/types.js';
import { AppServer, type WireObject } from './app-server.js';
import { ConversationStore } from './store.js';
import { applyNotification, emptySnapshot, upsertItem } from './state.js';
import { personalMemory } from './memory.js';

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
export class ChatService extends EventEmitter {
  private states = new Map<string, ChatSnapshot>();
  private loading = new Map<string, Promise<ChatSnapshot>>();
  private busy = false;
  private accepting = true;
  private timers = new Map<string, NodeJS.Timeout>();
  model: string | null = null;
  readonly workspace: string;

  constructor(readonly rpc: AppServer, readonly store: ConversationStore, dataDir: string, private selectedModel?: string) {
    super();
    this.workspace = join(dataDir, 'workspace');
    rpc.on('notification', (method: string, p: WireObject) => {
      const state = this.states.get(p.threadId);
      if (!state) return;
      applyNotification(state, method, p);
      this.changed(state.id, method !== 'item/agentMessage/delta' && method !== 'item/commandExecution/outputDelta');
    });
    rpc.on('blocked', (p: WireObject, method: string) => {
      const state = this.states.get(p.threadId);
      if (!state) return;
      state.notice = 'Действие требует разрешения и отклонено. MVP работает только в режиме чтения.';
      state.events.push({ id: `blocked-${Date.now()}`, label: 'Запрос отклонён', detail: method, status: 'declined' });
      this.changed(state.id, true);
    });
    rpc.on('disconnected', (message: string) => {
      for (const state of this.states.values()) {
        state.activeTurnId = null; state.status = 'error'; state.error = message;
        this.changed(state.id, true);
      }
    });
  }
  async init() { await this.store.init(); await mkdir(this.workspace, { recursive: true, mode: 0o700 }); }
  assertOwned(id: string) { if (!this.store.get(id)) throw new HttpError(404, 'Диалог не найден в этом приложении.'); }
  private assertConnected() {
    if (!this.accepting) throw new HttpError(503, 'Приложение останавливается.');
    if (!this.rpc.connected) throw new HttpError(503, this.rpc.lastError || 'Codex ещё подключается.');
  }
  private async settings() {
    const memory = await personalMemory.context();
    return {
      cwd: this.workspace, sandbox: 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'user',
      config: this.rpc.threadConfig,
      ...(this.selectedModel ? { model: this.selectedModel } : {}),
      developerInstructions: `Ты — Codex Z AI, персональный локальный помощник. Отвечай на языке пользователя. Работаешь только в режиме чтения. Не изменяй файлы, систему, сеть или внешние сервисы. Не обращайся к VPS 38.60.254.194. Не меняй VPN. Не запрашивай и не раскрывай секреты. Если нужны права на изменение, объясни ограничение.${memory ? `\n${memory}` : ''}`,
    };
  }
  private async checkPolicy(result: WireObject) {
    if (result.sandbox?.type !== 'readOnly' || result.sandbox?.networkAccess !== false || result.approvalsReviewer !== 'user' || result.approvalPolicy !== 'on-request') {
      throw new HttpError(503, 'Codex не подтвердил политику read-only. Отправка сообщений заблокирована.');
    }
    const inventory = await this.rpc.request('mcpServerStatus/list', { threadId: result.thread.id, detail: 'toolsAndAuthOnly' });
    if (inventory.data.some((server: WireObject) => server.runtimeStatus !== 'disabled' || Object.keys(server.tools ?? {}).length > 0) || inventory.nextCursor) throw new HttpError(503, 'Codex сохранил подключённые MCP-инструменты. Диалог заблокирован для безопасности.');
    this.model = result.model;
  }
  async create(): Promise<Conversation> {
    this.assertConnected();
    if (this.busy) throw new HttpError(409, 'Подождите завершения текущей операции.');
    this.busy = true;
    try {
      const result = await this.rpc.request('thread/start', { ...await this.settings(), ephemeral: false });
      await this.checkPolicy(result);
      const now = Date.now();
      const entry = { id: result.thread.id, title: 'Новый диалог', createdAt: now, updatedAt: now };
      await this.store.put(entry);
      this.states.set(entry.id, emptySnapshot(entry.id));
      return entry;
    } finally { this.busy = false; }
  }
  async open(id: string) {
    this.assertOwned(id); this.assertConnected();
    const existing = this.states.get(id);
    if (existing) return existing;
    const loading = this.loading.get(id);
    if (loading) return loading;
    const task = this.load(id).finally(() => this.loading.delete(id));
    this.loading.set(id, task);
    return task;
  }
  private async load(id: string) {
    const result = await this.rpc.request('thread/resume', { threadId: id, excludeTurns: true, ...await this.settings() });
    await this.checkPolicy(result);
    const state = emptySnapshot(id);
    const history = await this.rpc.request('thread/turns/list', { threadId: id, limit: 50, sortDirection: 'desc', itemsView: 'full' });
    state.olderCursor = history.nextCursor ?? null;
    for (const turn of [...history.data].reverse()) {
      for (const item of turn.items ?? []) upsertItem(state, item);
      if (turn.status === 'failed') { state.error = turn.error?.message || 'Предыдущий ответ завершился с ошибкой.'; state.status = 'error'; }
      else if (turn.status === 'interrupted' || turn.status === 'inProgress') state.notice = 'Предыдущий ответ был прерван. Можно продолжить диалог.';
    }
    // Notifications arriving after resume can now update this state.
    this.states.set(id, state);
    return state;
  }
  async older(id: string) {
    const state = await this.open(id);
    if (!state.olderCursor) return state;
    if (this.busy) throw new HttpError(409, 'Подождите завершения текущей операции.');
    this.busy = true;
    try {
      const history = await this.rpc.request('thread/turns/list', { threadId: id, cursor: state.olderCursor, limit: 50, sortDirection: 'desc', itemsView: 'full' });
      const older = emptySnapshot(id);
      for (const turn of [...history.data].reverse()) for (const item of turn.items ?? []) upsertItem(older, item);
      state.messages = [...older.messages, ...state.messages.filter((m) => !older.messages.some((o) => o.id === m.id))];
      state.events = [...older.events, ...state.events].slice(-100);
      state.olderCursor = history.nextCursor ?? null;
      this.changed(id, true);
      return state;
    } finally { this.busy = false; }
  }
  async send(id: string, text: string) {
    this.assertConnected(); this.assertOwned(id);
    if (this.busy || [...this.states.values()].some((s) => s.activeTurnId)) throw new HttpError(409, 'Уже идёт ответ. Дождитесь завершения или остановите его.');
    this.busy = true;
    let state: ChatSnapshot | undefined;
    try {
      state = await this.open(id);
      const entry = this.store.get(id)!;
      // Persist metadata before starting a turn; a disk failure must not send the prompt twice.
      await this.store.put({ ...entry, title: entry.title === 'Новый диалог' ? text.slice(0, 70) : entry.title, updatedAt: Date.now() });
      state.status = 'thinking'; state.error = null; state.notice = null;
      this.changed(id, true);
      await this.rpc.request('turn/start', {
        threadId: id, input: [{ type: 'text', text }],
        approvalPolicy: 'on-request', approvalsReviewer: 'user',
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
      });
      // turn/started and turn/completed notifications own the active-turn lifecycle.
      return { accepted: true };
    } catch (error) {
      if (state) { state.status = 'error'; state.error = error instanceof Error ? error.message : 'Ошибка отправки'; this.changed(id, true); }
      throw error;
    } finally { this.busy = false; }
  }
  async interrupt(id: string) {
    const state = await this.open(id);
    if (state.activeTurnId) await this.rpc.request('turn/interrupt', { threadId: id, turnId: state.activeTurnId });
    return { ok: true };
  }
  private changed(id: string, immediately = false) {
    if (immediately) {
      clearTimeout(this.timers.get(id)); this.timers.delete(id);
      this.emit('change', id, this.states.get(id));
    } else if (!this.timers.has(id)) this.timers.set(id, setTimeout(() => {
      this.timers.delete(id); this.emit('change', id, this.states.get(id));
    }, 40));
  }
  async stop() {
    this.accepting = false;
    await Promise.allSettled([...this.states.values()].filter((s) => s.activeTurnId).map((s) => this.rpc.request('turn/interrupt', { threadId: s.id, turnId: s.activeTurnId })));
    for (const timer of this.timers.values()) clearTimeout(timer);
    await this.rpc.stop();
  }
}
