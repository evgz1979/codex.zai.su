import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { chmodSync } from 'node:fs';
import { privateDirectory } from './private-files.js';
import { LIMITS,messagePreview,comparePosition,positionSequence, type Snapshot, type Conversation, type Message, type MessagePage,type Attachment,type AttachmentRequest, type SyncStatus } from '../../shared/types.js';
import {AppError} from '../core/errors.js';
import type {SourceTranscription} from '../core/source-adapter.js';
//: Хранит приватную расшифровку отдельно от синхронизируемого сообщения.
//: Версия и ID вложения запрещают показывать текст после замены голосового.
export interface StoredTranscription extends SourceTranscription {attachmentId:string;version:string;updatedAt:number}
//: Хранит курсоры возобновляемой истории и сверки новых сообщений.
//: Курсоры источника отделены от курсоров страниц браузерного SQLite API.
export interface SyncProgress {initialized:boolean;historyCursor:string|null;historyComplete:boolean;headKeys:string[];newerCursor:string|null;pendingHeadKeys:string[];nextHeadAt:number;checkpointIds:string[];lastHeadAt?:number}
//: Хранит настройки, выбор диалогов и полный кеш выбранной истории.
//: Исключение диалога меняет только выбор, не удаляя сохранённые данные.
export class Store {
  private db: DatabaseSync;
  revision=Date.now();
  private deletions:{revision:number;id:string;conversationId:string}[]=[];
  private droppedBefore=0;
  //: Открывает SQLite и создаёт совместимые таблицы кеша и выбора.
  //: Прежний кеш мигрируется без автоматического разрешения диалогов.
  constructor(directory: string) {
    privateDirectory(directory);
    const path = join(directory,'messenger.sqlite');
    this.db = new DatabaseSync(path); chmodSync(path,0o600);
    this.db.function('message_sequence',{deterministic:true},id=>typeof id==='string'?positionSequence({id})??null:null);
    this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS selected_conversations (id TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS conversation_cache (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS message_cache (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, date TEXT NOT NULL, payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS message_conversation ON message_cache(conversation_id,date);');
    if(!(this.db.prepare('PRAGMA table_info(message_cache)').all() as {name:string}[]).some(c=>c.name==='source_key'))this.db.exec('ALTER TABLE message_cache ADD COLUMN source_key TEXT;');
    this.db.exec('CREATE INDEX IF NOT EXISTS message_page_order ON message_cache(conversation_id,date DESC,id DESC); CREATE INDEX IF NOT EXISTS message_source_key ON message_cache(source_key); CREATE TABLE IF NOT EXISTS sync_state (id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS message_tombstones (source_key TEXT PRIMARY KEY);');
    this.db.exec("CREATE INDEX IF NOT EXISTS message_date_order ON message_cache(date DESC,id DESC); CREATE TABLE IF NOT EXISTS media_preload (message_id TEXT NOT NULL,attachment_id TEXT NOT NULL,version TEXT NOT NULL,variant TEXT NOT NULL,message_date TEXT NOT NULL,next_attempt INTEGER NOT NULL,PRIMARY KEY(message_id,attachment_id,version,variant));");
    this.db.exec('CREATE TABLE IF NOT EXISTS conversation_policy (id TEXT PRIMARY KEY,source_id TEXT NOT NULL,excluded INTEGER NOT NULL);');
    this.db.exec('CREATE TABLE IF NOT EXISTS voice_transcriptions (message_id TEXT PRIMARY KEY,payload TEXT NOT NULL);');
    // Мигрируем только прежний локальный кеш. Выбор по умолчанию остаётся пустым.
    const old = this.get('cache');
    if (old) { try { this.saveCache(JSON.parse(old)); } catch { /* Повреждённый старый кеш не является настройкой. */ } this.remove('cache'); }
  }
  //: Читает строковую настройку по ключу.
  //: Использует параметризованный SELECT.
  get(key: string): string | undefined { return (this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as {value:string}|undefined)?.value; }
  //: Заменяет строковую настройку.
  //: Не формирует SQL из текста сообщений.
  set(key: string, value: string) { this.db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(key,value); }
  //: Удаляет одну настройку по ключу.
  //: Не удаляет таблицы, выбор или чужие данные.
  remove(key: string) { this.db.prepare('DELETE FROM settings WHERE key = ?').run(key); }
  //: Читает одни сохранённые метаданные диалога.
  //: Историю и реквизиты источника не загружает.
  conversation(id:string):Conversation|undefined{const row=this.db.prepare('SELECT payload FROM conversation_cache WHERE id=?').get(id) as {payload:string}|undefined;return row?JSON.parse(row.payload):undefined;}
  //: Читает ровно одно сообщение по общему ID для защищённого доступа к медиа.
  //: Проверку выбора выполняет ядро перед обращением к этому методу.
  message(id:string):Message|undefined{const row=this.db.prepare('SELECT payload FROM message_cache WHERE id=?').get(id) as {payload:string}|undefined;return row?this.withTranscription(JSON.parse(row.payload)):undefined;}
  //: Читает внутреннее состояние одного ранее запрошенного задания.
  //: Проверку доступа к диалогу выполняет сервис до чтения этой записи.
  transcription(id:string):StoredTranscription|undefined{const row=this.db.prepare('SELECT payload FROM voice_transcriptions WHERE message_id=?').get(id) as {payload:string}|undefined;return row?JSON.parse(row.payload):undefined;}
  //: Дополняет сообщение только расшифровкой той же версии голосового.
  //: Синхронизация исходного DTO не удаляет текст и не возвращает устаревший результат.
  private withTranscription(message:Message):Message{
    delete message.voiceTranscription;
    if(!message.attachments.some(a=>a.kind==='audio'&&a.isVoice&&a.downloadable!==false))return message;
    const saved=this.transcription(message.id);
    if(saved&&saved.version===(message.editedAt||message.date)&&message.attachments.some(a=>a.id===saved.attachmentId&&a.kind==='audio'&&a.isVoice&&a.downloadable!==false))message.voiceTranscription={text:saved.text,pending:saved.pending};
    return message;
  }
  //: Сохраняет расшифровку без изменения сообщения, превью и непрочитанных.
  //: Завершённый ответ того же задания не откатывается поздним частичным текстом.
  saveTranscription(message:Message,attachmentId:string,result:SourceTranscription){
    const previous=this.transcription(message.id);const version=message.editedAt||message.date;
    if(previous?.version===version&&previous.attachmentId===attachmentId&&previous.transcriptionId===result.transcriptionId&&!previous.pending&&result.pending)return;
    const value:StoredTranscription={...result,attachmentId,version,updatedAt:Date.now()};
    this.db.prepare('INSERT OR REPLACE INTO voice_transcriptions(message_id,payload) VALUES (?,?)').run(message.id,JSON.stringify(value));this.revision++;
  }
  //: Читает постоянную границу реально просмотренных сообщений одного диалога.
  //: Позиция не содержит текст и не открывает доступ к исключённому архиву.
  readPosition(id:string):Pick<Message,'id'|'date'|'sequence'>|undefined{const value=this.get(`read.position.${id}`);return value?JSON.parse(value):undefined;}
  //: Считает входящие после просмотренной позиции индексированной выборкой.
  //: Последовательность источника различает сообщения одной секунды.
  private unreadAfter(id:string,position:Pick<Message,'id'|'date'|'sequence'>){const sequence=positionSequence(position);return Number((this.db.prepare("SELECT COUNT(*) AS n FROM message_cache WHERE conversation_id=? AND COALESCE(json_extract(payload,'$.outgoing'),0)=0 AND (date>? OR (date=? AND CASE WHEN ? IS NOT NULL AND COALESCE(json_extract(payload,'$.sequence'),message_sequence(id)) IS NOT NULL THEN COALESCE(json_extract(payload,'$.sequence'),message_sequence(id))>? ELSE id>? END))").get(id,position.date,position.date,sequence??null,sequence??null,position.id) as {n:number}).n);}
  //: Не позволяет запоздалым метаданным вернуть прочитанные счётчики.
  //: Более свежая голова источника сохраняет собственное число непрочитанных.
  withReadPosition(conversation:Conversation){const position=this.readPosition(conversation.id);return position&&conversation.updatedAt<=position.date?{...conversation,unreadCount:this.unreadAfter(conversation.id,position)}:conversation;}
  //: Атомарно сохраняет просмотр до конкретного сообщения и оставшиеся входящие.
  //: Поздняя отметка старой страницы не передвигает границу назад.
  acknowledgeRead(id:string,message:Message){
    const previous=this.readPosition(id);if(previous&&comparePosition(previous,message)>=0)return;
    const c=this.conversation(id);if(!c)throw new AppError(404,'Диалог не найден.');
    this.db.exec('BEGIN IMMEDIATE');try{this.set(`read.position.${id}`,JSON.stringify({id:message.id,date:message.date,sequence:positionSequence(message)}));c.unreadCount=this.unreadAfter(id,message);this.db.prepare('UPDATE conversation_cache SET payload=? WHERE id=?').run(JSON.stringify(c),id);this.db.exec('COMMIT');this.revision++;}catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  //: Читает разрешённые ID диалогов из SQLite.
  //: Результат сохраняется после перезапуска процесса.
  selected(): string[] { return (this.db.prepare('SELECT id FROM selected_conversations ORDER BY id').all() as {id:string}[]).map(r=>r.id); }
  //: Считает непрочитанные только по метаданным выбранных диалогов.
  //: Worker получает число без загрузки текстов или истории.
  badgeCount(){return Number((this.db.prepare("SELECT COALESCE(SUM(MAX(0,COALESCE(json_extract(c.payload,'$.unreadCount'),0))),0) AS n FROM conversation_cache c JOIN selected_conversations s ON s.id=c.id").get() as {n:number}).n);}
  //: Атомарно заменяет список разрешённых ID.
  //: При ошибке транзакция откатывается, кеш не удаляется.
  select(ids: string[],catalog?:Conversation[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try { this.db.exec('DELETE FROM selected_conversations'); for (const id of ids) this.db.prepare('INSERT INTO selected_conversations (id) VALUES (?)').run(id);if(catalog)for(const c of catalog)this.db.prepare('INSERT OR REPLACE INTO conversation_policy(id,source_id,excluded) VALUES (?,?,?)').run(c.id,c.sourceId,ids.includes(c.id)?0:1);this.db.exec('COMMIT');this.revision++; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  //: Запоминает метаданные каталога без чтения истории невыбранных диалогов.
  //: При первом запуске прежние невыбранные и архивные диалоги остаются исключёнными.
  observeCatalog(sourceId:string,catalog:Conversation[],now=Date.now()){
    const key=`discovery.baseline.${sourceId}`;const first=!this.get(key);const selected=new Set(this.selected());
    const archived=first?(this.db.prepare("SELECT id FROM conversation_cache WHERE json_extract(payload,'$.sourceId')=?").all(sourceId) as {id:string}[]).map(row=>row.id):[];
    this.db.exec('BEGIN IMMEDIATE');try{for(const id of new Set([...catalog.map(c=>c.id),...archived]))this.db.prepare('INSERT OR IGNORE INTO conversation_policy(id,source_id,excluded) VALUES (?,?,?)').run(id,sourceId,first&&!selected.has(id)?1:0);if(first)this.set(key,String(now));this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
    return first;
  }
  //: Проверяет сохранённое исключение владельца для автоматического обнаружения.
  //: Неизвестный после начальной фиксации контакт можно принять по входящему.
  excluded(id:string){return (this.db.prepare('SELECT excluded FROM conversation_policy WHERE id=?').get(id) as {excluded:number}|undefined)?.excluded===1;}
  //: Атомарно разрешает новый личный контакт и сохраняет только его метаданные.
  //: Готовая политика исключения и предел списка проверяются до доступа к сообщению.
  admitContact(conversation:Conversation){
    if(this.excluded(conversation.id)||!this.get(`discovery.baseline.${conversation.sourceId}`))return false;
    const selected=this.selected();if(selected.includes(conversation.id))return true;if(selected.length>=LIMITS.conversations)return false;
    this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO selected_conversations(id) VALUES (?)').run(conversation.id);this.db.prepare('INSERT OR REPLACE INTO conversation_policy(id,source_id,excluded) VALUES (?,?,0)').run(conversation.id,conversation.sourceId);this.db.prepare('INSERT OR REPLACE INTO conversation_cache(id,payload) VALUES (?,?)').run(conversation.id,JSON.stringify(conversation));this.set(`discovery.notify.${conversation.id}`,conversation.updatedAt);this.db.exec('COMMIT');this.revision++;return true;}catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  //: Загружает кеш только переданных разрешённых ID.
  //: Пустой выбор даёт пустую ленту, исключённый архив не читается для UI.
  loadCache(ids: string[] = this.selected()): Snapshot {
    const empty: Snapshot = { sources:[], conversations:[], messages:[], refreshedAt:this.get('refreshedAt')||null, stale:true };
    if (!ids.length) return empty;
    const placeholders = ids.map(()=>'?').join(',');
    const conversations = (this.db.prepare(`SELECT payload FROM conversation_cache WHERE id IN (${placeholders})`).all(...ids) as {payload:string}[]).map(r=>JSON.parse(r.payload) as Conversation);
    const recent=this.db.prepare('SELECT payload FROM message_cache WHERE conversation_id=? ORDER BY date DESC,id DESC LIMIT ?');
    const messages=ids.flatMap(id=>(recent.all(id,LIMITS.pageMessages) as {payload:string}[]).map(r=>JSON.parse(r.payload) as Message)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).slice(-LIMITS.cachedMessages);
    return { ...empty,conversations,messages:messages.map(message=>this.withTranscription(message)) };
  }
  //: Сохраняет метаданные и сообщения без усечения накопленной истории.
  //: Объём памяти ответа ограничен отдельно; исключённый архив не удаляется.
  saveCache(snapshot: Snapshot) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const c of snapshot.conversations) this.db.prepare('INSERT OR REPLACE INTO conversation_cache (id,payload) VALUES (?,?)').run(c.id,JSON.stringify(this.withReadPosition(c)));
      for (const m of snapshot.messages) this.db.prepare('INSERT OR REPLACE INTO message_cache (id,conversation_id,date,payload,source_key) VALUES (?,?,?,?,?)').run(m.id,m.conversationId,m.date,JSON.stringify({...m,voiceTranscription:undefined}),m.sourceKey||null);
      if (snapshot.refreshedAt) this.set('refreshedAt',snapshot.refreshedAt);
      this.db.exec('COMMIT');
      this.revision++;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  //: Удаляет кеш только явной локальной командой.
  //: Пароли, выбор и Telegram-сессия сохраняются.
  clearCache() { this.db.exec('DELETE FROM voice_transcriptions; DELETE FROM message_cache; DELETE FROM conversation_cache; DELETE FROM sync_state; DELETE FROM message_tombstones; DELETE FROM media_preload; VACUUM;'); this.remove('refreshedAt');this.revision++; }
  //: Возвращает одну индексированную страницу SQLite без запроса к источнику.
  //: Курсор привязан к диалогу, дате и ID; незавершённая история может ожидать фоновой загрузки.
  messagePage(id:string,before?:string):MessagePage {
    const ids=id==='inbox'?this.selected():[id];
    let anchor:{conversationId:string;date:string;id:string}|undefined;
    if(before){try{anchor=JSON.parse(Buffer.from(before,'base64url').toString());}catch{throw new AppError(400,'Некорректный курсор кеша.');}if(!anchor||anchor.conversationId!==id||typeof anchor.id!=='string'||typeof anchor.date!=='string'||!Number.isFinite(Date.parse(anchor.date)))throw new AppError(400,'Курсор не относится к этому диалогу.');}
    const query=anchor?this.db.prepare('SELECT payload FROM message_cache WHERE conversation_id=? AND (date<? OR (date=? AND id<?)) ORDER BY date DESC,id DESC LIMIT ?'):this.db.prepare('SELECT payload FROM message_cache WHERE conversation_id=? ORDER BY date DESC,id DESC LIMIT ?');
    const rows=ids.flatMap(conversationId=>(anchor?query.all(conversationId,anchor.date,anchor.date,anchor.id,LIMITS.pageMessages+1):query.all(conversationId,LIMITS.pageMessages+1)) as {payload:string}[]).map(r=>JSON.parse(r.payload) as Message).sort((a,b)=>a.date===b.date?(a.id<b.id?1:a.id>b.id?-1:0):a.date<b.date?1:-1);
    const progress=ids.map(conversationId=>this.progress(conversationId));const historyComplete=progress.every(p=>p.historyComplete);const more=rows.length>LIMITS.pageMessages;const messages=rows.slice(0,LIMITS.pageMessages).reverse();const oldest=messages[0];
    const cursor=oldest?Buffer.from(JSON.stringify({conversationId:id,date:oldest.date,id:oldest.id})).toString('base64url'):before||null;
    return {conversationId:id,messages:messages.map(message=>this.withTranscription(message)),nextCursor:more||!historyComplete?cursor:null,oldestCursor:cursor,historyComplete,cached:true,sourceUpdatedAt:progress.length?Math.min(...progress.map(p=>p.lastHeadAt||0)):undefined};
  }
  //: Читает сохранённый прогресс или начальное состояние нового выбранного чата.
  //: Завершённая история не загружается заново при обычном рестарте.
  progress(id:string):SyncProgress {const row=this.db.prepare('SELECT payload FROM sync_state WHERE id=?').get(id) as {payload:string}|undefined;return row?JSON.parse(row.payload):{initialized:false,historyCursor:null,historyComplete:false,headKeys:[],newerCursor:null,pendingHeadKeys:[],nextHeadAt:0,checkpointIds:[]};}
  //: Проверяет наличие последней записанной страницы перед возобновлением.
  //: После отката на старый усечённый кеш пропуски приводят к повторному заполнению.
  checkpointExists(ids:string[]){if(!ids.length)return true;return Number((this.db.prepare(`SELECT COUNT(*) AS n FROM message_cache WHERE id IN (${ids.map(()=>'?').join(',')})`).get(...ids) as {n:number}).n)===ids.length;}
  //: Сохраняет курсоры только после успешной записи соответствующей страницы.
  //: Прогресс переживает перезапуск и не содержит коды или ключи Telegram.
  saveProgress(id:string,progress:SyncProgress){const previous=this.progress(id);this.db.prepare('INSERT OR REPLACE INTO sync_state (id,payload) VALUES (?,?)').run(id,JSON.stringify(progress));if(previous.initialized!==progress.initialized||previous.historyComplete!==progress.historyComplete||!!previous.newerCursor!==!!progress.newerCursor)this.revision++;}
  //: Записывает страницу или событие с дедупликацией и обновляет превью.
  //: Старые страницы не откатывают превью; одинаковые сообщения не создают лишнюю ревизию.
  upsertMessages(messages:Message[],countUnread=false){
    let changed=false;this.db.exec('BEGIN IMMEDIATE');
    const unread=new Map<string,number>();
    try{for(const m of messages){const existed=countUnread?!!this.db.prepare('SELECT 1 FROM message_cache WHERE id=?').get(m.id):true;const result=this.db.prepare("INSERT INTO message_cache (id,conversation_id,date,payload,source_key) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM message_tombstones WHERE source_key=?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,payload=excluded.payload,source_key=excluded.source_key WHERE payload<>excluded.payload AND COALESCE(json_extract(excluded.payload,'$.editedAt'),excluded.date)>=COALESCE(json_extract(message_cache.payload,'$.editedAt'),message_cache.date)").run(m.id,m.conversationId,m.date,JSON.stringify({...m,voiceTranscription:undefined}),m.sourceKey||null,m.sourceKey||null);if(countUnread&&!m.outgoing&&!existed&&Number(result.changes)>0)unread.set(m.conversationId,(unread.get(m.conversationId)||0)+1);changed ||=Number(result.changes)>0;}
      for(const id of new Set(messages.map(m=>m.conversationId))){const c=this.conversation(id);const latest=this.db.prepare("SELECT payload FROM message_cache WHERE conversation_id=? ORDER BY date DESC,COALESCE(json_extract(payload,'$.sequence'),message_sequence(id)) DESC,id DESC LIMIT 1").get(id) as {payload:string}|undefined;if(c&&latest){const previous=JSON.stringify(c);const m=JSON.parse(latest.payload) as Message;if(!c.previewMessageId||comparePosition(m,{id:c.previewMessageId,date:c.updatedAt})>=0){c.preview=messagePreview(m);c.previewMessageId=m.id;c.updatedAt=m.date;}c.unreadCount+=unread.get(id)||0;changed ||=previous!==JSON.stringify(c);this.db.prepare('UPDATE conversation_cache SET payload=? WHERE id=?').run(JSON.stringify(c),id);}}
      this.db.exec('COMMIT');if(changed)this.revision++;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  //: Удаляет полученные от источника ключи только среди текущих разрешённых ID.
  //: Архив исключённых диалогов не затрагивается; браузеру передаются только общие ID.
  deleteSourceKeys(keys:string[],allowed:string[]){
    if(!keys.length||!allowed.length)return;
    for(let offset=0;offset<keys.length;offset+=100){const part=keys.slice(offset,offset+100);const query=`source_key IN (${part.map(()=>'?').join(',')}) AND conversation_id IN (${allowed.map(()=>'?').join(',')})`;const rows=this.db.prepare(`SELECT id,conversation_id,source_key FROM message_cache WHERE ${query}`).all(...part,...allowed) as {id:string;conversation_id:string;source_key:string}[];
      if(!rows.length)continue;this.db.exec('BEGIN IMMEDIATE');try{for(const row of rows){this.db.prepare('INSERT OR IGNORE INTO message_tombstones(source_key) VALUES (?)').run(row.source_key);this.db.prepare('DELETE FROM voice_transcriptions WHERE message_id=?').run(row.id);}this.db.prepare(`DELETE FROM message_cache WHERE ${query}`).run(...part,...allowed);this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}this.revision++;
      const removed=new Set(rows.map(r=>r.id));for(const id of new Set(rows.map(r=>r.conversation_id))){const c=this.conversation(id);const last=this.db.prepare("SELECT payload FROM message_cache WHERE conversation_id=? ORDER BY date DESC,COALESCE(json_extract(payload,'$.sequence'),message_sequence(id)) DESC,id DESC LIMIT 1").get(id) as {payload:string}|undefined;if(c&&(!c.previewMessageId||removed.has(c.previewMessageId))){const message=last?JSON.parse(last.payload) as Message:undefined;c.preview=message?messagePreview(message):'';c.previewMessageId=message?.id;if(message)c.updatedAt=message.date;this.db.prepare('UPDATE conversation_cache SET payload=? WHERE id=?').run(JSON.stringify(c),id);}const progress=this.progress(id);progress.checkpointIds=(progress.checkpointIds||[]).filter(key=>!removed.has(key));progress.headKeys=progress.headKeys.filter(key=>!removed.has(key));this.saveProgress(id,progress);}
      for(const row of rows)this.deletions.push({revision:this.revision,id:row.id,conversationId:row.conversation_id});while(this.deletions.length>1000)this.droppedBefore=this.deletions.shift()!.revision;
    }
  }
  //: Передаёт небольшую ревизию, разрешения и удаления для автоматического UI.
  //: Не читает тексты сообщений; пропуск старого журнала требует сброса окна.
  access(since=0){const ids=this.selected();const selected=new Set(ids);return {ids,revision:this.revision,deletedIds:this.deletions.filter(d=>d.revision>since&&selected.has(d.conversationId)).map(d=>d.id),reset:since>0&&since<this.droppedBefore,sync:this.syncStatus()};}
  //: Возвращает число выбранных диалогов с незавершённой историей.
  //: Состояние относится только к разрешённым диалогам, без пользовательских текстов.
  syncStatus():SyncStatus{const pause=Number(this.get('sync.pausedUntil')||0);return {pendingConversations:this.selected().filter(id=>{const p=this.progress(id);return !p.historyComplete||!!p.newerCursor;}).length,...(pause>Date.now()?{pausedUntil:new Date(pause).toISOString()}:{})};}
  //: Выбирает ближайшую неподготовленную миниатюру либо оригинал за заданное окно.
  //: JSON разворачивается только для выбранных диалогов; выполненные задания не повторяются после рестарта.
  mediaJobs(since:string,now:number,preview:boolean){
    const variant=preview?'preview':'original';
    const rows=this.db.prepare(`SELECT m.payload,a.value AS attachment FROM message_cache m JOIN selected_conversations s ON s.id=m.conversation_id JOIN json_each(m.payload,'$.attachments') a LEFT JOIN media_preload p ON p.message_id=m.id AND p.attachment_id=json_extract(a.value,'$.id') AND p.version=COALESCE(json_extract(m.payload,'$.editedAt'),m.date) AND p.variant=? WHERE m.date>=? AND COALESCE(json_extract(a.value,'$.downloadable'),1)<>0 AND (p.message_id IS NULL OR (p.next_attempt>0 AND p.next_attempt<=?)) ORDER BY m.date DESC,m.id DESC LIMIT 20`).all(variant,since,now) as {payload:string;attachment:string}[];
    return rows.map(row=>({message:JSON.parse(row.payload) as Message,attachment:JSON.parse(row.attachment) as Attachment}));
  }
  //: Сохраняет результат фонового задания или время следующей попытки.
  //: Нулевое значение означает завершение; исключение чата не меняет архив сообщений.
  finishMediaJob(input:AttachmentRequest,message:Message,nextAttempt=0){this.db.prepare('INSERT OR REPLACE INTO media_preload(message_id,attachment_id,version,variant,message_date,next_attempt) VALUES (?,?,?,?,?,?)').run(message.id,input.attachmentId,message.editedAt||message.date,input.variant||'original',message.date,nextAttempt);}
  //: Удаляет устаревшие служебные отметки за пределами окна предзагрузки.
  //: Сообщения и уже скачанные файлы этим действием не удаляются.
  pruneMediaJobs(since:string){this.db.prepare('DELETE FROM media_preload WHERE message_date<?').run(since);}
  //: Закрывает подключение SQLite.
  //: Не удаляет постоянные настройки.
  close() { this.db.close(); }
}
