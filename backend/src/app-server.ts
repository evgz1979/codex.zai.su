import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';

export type WireObject = Record<string, any>; // App Server is an external versioned JSON boundary.
export const safetyConfig = {
  sandbox_mode: 'read-only',
  approval_policy: 'on-request',
  approvals_reviewer: 'user',
  mcp_servers: {},
  'features.apps': false,
  'features.multi_agent': false,
  'features.memories': false,
  'features.hooks': false,
  'features.plugins': false,
  'features.computer_use': false,
  'features.browser_use': false,
  'features.browser_use_external': false,
  'features.in_app_browser': false,
  'features.code_mode': false,
  web_search: 'disabled',
};

export class AppServer extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;
  private pending = new Map<number, { resolve: (v: WireObject) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private nextId = 1;
  private starting?: Promise<void>;
  connected = false;
  lastError: string | null = null;
  threadConfig: WireObject = { ...safetyConfig };

  constructor(private bin: string, private cwd: string) { super(); }

  async start() {
    if (this.connected) return;
    if (this.starting) return this.starting;
    this.starting = this.connect().finally(() => { this.starting = undefined; });
    return this.starting;
  }

  private async connect() {
    const args = ['app-server', '--listen', 'stdio://'];
    for (const [key, value] of Object.entries(safetyConfig)) {
      args.push('-c', `${key}=${typeof value === 'object' ? '{}' : JSON.stringify(value)}`);
    }
    // Never log the inherited environment, account response, or raw protocol.
    const child = spawn(this.bin, args, { cwd: this.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    child.stderr.resume();
    child.stdin.on('error', () => this.disconnected(new Error('Канал App Server закрыт. Перезапустите приложение.')));
    child.once('error', (e) => this.disconnected(new Error(`Не удалось запустить Codex (${(e as NodeJS.ErrnoException).code || 'ошибка запуска'}). Проверьте CODEX_BIN.`)));
    child.once('exit', (code) => this.disconnected(new Error(`Codex App Server остановлен (код ${code ?? 'signal'}). Перезапустите приложение.`)));
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      try { this.receive(JSON.parse(line)); }
      catch { this.disconnected(new Error('Неверный формат сообщения App Server.')); child.kill(); }
    });
    try {
      await this.request('initialize', { clientInfo: { name: 'codex_z_ai', title: 'Codex Z AI', version: '0.1.0' } });
      this.write({ method: 'initialized', params: {} });
      // TOML tables merge with the user's config. An empty mcp_servers table
      // does NOT remove configured servers: explicitly disable every entry.
      const effective = await this.request('config/read', { includeLayers: false });
      this.threadConfig = { ...safetyConfig, mcp_servers: Object.fromEntries(
        Object.keys(effective.config?.mcp_servers ?? {}).map((name) => [name, { enabled: false }]),
      ) };
      const account = await this.request('account/read', {});
      if (!account.account) throw new Error('Codex не авторизован. Выполните codex login в Terminal и перезапустите приложение.');
      this.connected = true;
      this.lastError = null;
    } catch (error) {
      this.disconnected(error instanceof Error ? error : new Error('Ошибка инициализации Codex'));
      child.kill();
      throw error;
    }
  }

  request(method: string, params: WireObject): Promise<WireObject> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // Do not retry a potentially accepted turn: its outcome is unknown.
        this.disconnected(new Error(`Codex не ответил на ${method}. Перезапустите приложение для восстановления истории.`));
        this.child?.kill();
        reject(new Error(`Истекло время ожидания ${method}.`));
      }, 60_000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  private write(value: WireObject) {
    if (!this.child || this.child.stdin.destroyed) throw new Error('App Server недоступен');
    this.child.stdin.write(`${JSON.stringify(value)}\n`);
  }

  private receive(message: WireObject) {
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'Ошибка Codex'));
      else pending.resolve(message.result ?? {});
      return;
    }
    if (message.id !== undefined && message.method) {
      // The MVP cannot grant elevated permissions. Explicitly decline, never auto-accept.
      const method: string = message.method;
      let result: WireObject | undefined;
      if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') result = { decision: 'decline' };
      else if (method === 'item/permissions/requestApproval') result = { permissions: {}, scope: 'turn' };
      else if (method === 'mcpServer/elicitation/request') result = { action: 'decline', content: null };
      if (result) this.write({ id: message.id, result });
      else this.write({ id: message.id, error: { code: -32601, message: 'Этот запрос требует взаимодействия, которое не поддерживается read-only MVP.' } });
      this.emit('blocked', message.params ?? {}, method);
      return;
    }
    if (message.method) this.emit('notification', message.method, message.params ?? {});
  }

  private disconnected(error: Error) {
    this.connected = false;
    this.lastError = error.message;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.emit('disconnected', error.message);
  }

  async stop() {
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    child.stdin.end();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}
