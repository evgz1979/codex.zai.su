import type { Store } from '../storage/store.js';
import {LIMITS,type Conversation} from '../../shared/types.js';
import { AppError } from './errors.js';
//: Хранит разрешённые диалоги и проверяет доступ на каждой операции.
//: История запрещена до выбора или разрешения нового личного входящего; исключения постоянны.
export class ConversationSelectionService {
  revision = 0;
  //: Подключает постоянный выбор диалогов в SQLite.
  //: Отсутствующие настройки означают пустой выбор.
  constructor(private store: Store) {}
  //: Читает сохранённые разрешённые ID.
  //: Возвращает только ID, без загрузки истории.
  ids() { return this.store.selected(); }
  //: Проверяет конкретный диалог по сохранённому выбору.
  //: Невыбранный диалог не получает доступ к истории.
  allows(id: string) { return this.ids().includes(id); }
  //: Отклоняет операции над исключённым диалогом.
  //: Сервер возвращает 403 независимо от состояния браузера.
  require(id: string) { if (!this.allows(id)) throw new AppError(403,'Диалог не разрешён в админке.'); }
  //: Атомарно заменяет выбор известными ID каталога.
  //: Ограничивает число выборов и обновляет ревизию для текущих запросов.
  replace(ids: string[], available: Conversation[]) {
    if (ids.length > LIMITS.conversations || new Set(ids).size !== ids.length || ids.some(id=>!available.some(c=>c.id===id))) throw new AppError(400,'Проверьте выбор диалогов.');
    const unseen=this.ids().filter(id=>!available.some(c=>c.id===id));
    const selected=[...new Set([...ids,...unseen])];if(selected.length>LIMITS.conversations)throw new AppError(400,'Достигнут предел диалогов.');
    this.store.select(selected,available); this.revision++;
  }
  //: Фиксирует исходный каталог и обнаруживает новые личные входящие по метаданным.
  //: Старые невыбранные, исключённые, боты, группы и каналы сами не разрешаются.
  observe(sourceId:string,catalog:Conversation[]){
    const first=this.store.observeCatalog(sourceId,catalog);if(first)return;
    const since=Number(this.store.get(`discovery.baseline.${sourceId}`));
    for(const c of catalog)if(c.unreadCount>0&&Date.parse(c.updatedAt)>=Math.floor(since/1000)*1000)this.admit(c);
  }
  //: Разрешает новый входящий личный контакт до преобразования его сообщения.
  //: Явное исключение переживает рестарт и имеет приоритет над обнаружением.
  admit(conversation:Conversation){
    if(this.allows(conversation.id))return true;
    if(conversation.kind!=='direct'||conversation.isBot||conversation.recipient.isSelf)return false;
    if(!this.store.admitContact(conversation))return false;this.revision++;return true;
  }
  //: Снимает разрешение со всех диалогов.
  //: Архивные сообщения не удаляются, ревизия меняется.
  clear() { const previous=this.ids().map(id=>this.store.conversation(id)).filter((c):c is Conversation=>!!c);this.store.select([],previous);this.revision++; }
}
