import type { ChatSnapshot, TechnicalEvent } from '../../shared/types.js';
import type { WireObject } from './app-server.js';

export function emptySnapshot(id: string): ChatSnapshot {
  return { id, messages: [], events: [], status: 'ready', activeTurnId: null, error: null, notice: null, olderCursor: null };
}
const labels: Record<string, string> = { commandExecution: 'Команда', fileChange: 'Изменение файлов', mcpToolCall: 'Вызов инструмента', plan: 'План', webSearch: 'Поиск', contextCompaction: 'Сжатие контекста' };
export function upsertItem(state: ChatSnapshot, item: WireObject) {
  if (typeof item.id !== 'string') return;
  if (item.type === 'userMessage' || item.type === 'agentMessage') {
    const text = item.type === 'userMessage'
      ? (item.content ?? []).filter((c: WireObject) => c.type === 'text').map((c: WireObject) => c.text).join('\n')
      : String(item.text ?? '');
    const message = { id: item.id, role: item.type === 'userMessage' ? 'user' as const : 'assistant' as const, text };
    const index = state.messages.findIndex((v) => v.id === item.id);
    if (index < 0) state.messages.push(message);
    else state.messages[index] = message;
    return;
  }
  // Reasoning internals are not forwarded to the browser.
  if (!labels[item.type]) return;
  let detail = '';
  if (item.type === 'commandExecution') detail = `${item.command || ''}\n${item.aggregatedOutput || ''}${item.exitCode != null ? `\nКод завершения: ${item.exitCode}` : ''}`;
  else if (item.type === 'plan') detail = item.text ?? '';
  else if (item.type === 'mcpToolCall') detail = `${item.server}/${item.tool}`;
  else if (item.type === 'fileChange') detail = (item.changes ?? []).map((c: WireObject) => c.path).join('\n');
  const event: TechnicalEvent = { id: item.id, label: labels[item.type], detail: detail.slice(-32_000), status: item.status };
  const index = state.events.findIndex((v) => v.id === item.id);
  if (index < 0) state.events.push(event); else state.events[index] = event;
  state.events = state.events.slice(-100);
}

export function applyNotification(state: ChatSnapshot, method: string, p: WireObject) {
  if (method === 'turn/started') {
    state.activeTurnId = p.turn.id; state.status = 'thinking'; state.error = null; state.notice = null;
  } else if (method === 'turn/completed') {
    state.activeTurnId = null;
    state.error = p.turn.error?.message ?? (p.turn.status === 'failed' ? 'Codex не смог завершить ответ.' : null);
    state.status = state.error ? 'error' : 'ready';
    if (p.turn.status === 'interrupted') state.notice = 'Ответ остановлен. Можно продолжить диалог.';
    for (const item of p.turn.items ?? []) upsertItem(state, item);
  } else if (method === 'item/started' || method === 'item/completed') {
    upsertItem(state, p.item);
    if (state.activeTurnId) state.status = method === 'item/started' && ['commandExecution', 'mcpToolCall', 'fileChange'].includes(p.item.type) ? 'acting' : 'thinking';
  } else if (method === 'item/agentMessage/delta') {
    let message = state.messages.find((v) => v.id === p.itemId);
    if (!message) { message = { id: p.itemId, role: 'assistant', text: '' }; state.messages.push(message); }
    message.text += p.delta;
  } else if (method === 'item/commandExecution/outputDelta') {
    const event = state.events.find((v) => v.id === p.itemId);
    if (event) event.detail = (event.detail + p.delta).slice(-32_000);
  } else if (method === 'error') {
    state.error = p.error?.message || 'Ошибка Codex';
    state.status = p.willRetry ? 'thinking' : 'error';
  }
}
