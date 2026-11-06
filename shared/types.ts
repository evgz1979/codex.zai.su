export type ChatStatus = 'ready' | 'thinking' | 'acting' | 'error';
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}
export interface TechnicalEvent {
  id: string;
  label: string;
  detail: string;
  status?: string;
}
export interface ChatSnapshot {
  id: string;
  messages: Message[];
  events: TechnicalEvent[];
  status: ChatStatus;
  activeTurnId: string | null;
  error: string | null;
  notice: string | null;
  olderCursor: string | null;
}
export interface Health {
  status: 'ok' | 'error';
  codex: 'connected' | 'disconnected';
  sandbox: 'read-only';
  model: string | null;
  error?: string;
}
