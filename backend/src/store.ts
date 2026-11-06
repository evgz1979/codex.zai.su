import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Conversation } from '../../shared/types.js';

// This allowlist prevents the browser from opening unrelated Codex sessions.
export class ConversationStore {
  private entries: Conversation[] = [];
  private queue = Promise.resolve();
  constructor(private dir: string) {}
  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    try {
      const value: unknown = JSON.parse(await readFile(join(this.dir, 'conversations.json'), 'utf8'));
      if (!Array.isArray(value) || !value.every((v) => v && typeof v.id === 'string' && typeof v.title === 'string' && typeof v.createdAt === 'number' && typeof v.updatedAt === 'number')) throw new Error('Некорректный индекс диалогов');
      this.entries = value;
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
  list() { return this.entries.map((v) => ({ ...v })).sort((a, b) => b.updatedAt - a.updatedAt); }
  get(id: string) { return this.entries.find((v) => v.id === id); }
  async put(entry: Conversation) {
    const previous = this.get(entry.id);
    if (previous) Object.assign(previous, entry);
    else this.entries.push({ ...entry });
    const body = JSON.stringify(this.entries, null, 2);
    const save = this.queue.then(async () => {
      const temp = join(this.dir, 'conversations.json.tmp');
      await writeFile(temp, body, { mode: 0o600 });
      await rename(temp, join(this.dir, 'conversations.json'));
    });
    this.queue = save.catch(() => {});
    await save;
  }
}
