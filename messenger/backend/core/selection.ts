import type { Store } from '../storage/store.js';
import type { Conversation } from '../../shared/types.js';
import { AppError } from './errors.js';
//: Хранит разрешённые диалоги и проверяет доступ на каждой операции.
//: Пустой выбор запрещает загрузку, отправку и отметку прочитанного.
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
    if (ids.length > 100 || new Set(ids).size !== ids.length || ids.some(id=>!available.some(c=>c.id===id))) throw new AppError(400,'Проверьте выбор диалогов.');
    this.store.select(ids); this.revision++;
  }
  //: Снимает разрешение со всех диалогов.
  //: Архивные сообщения не удаляются, ревизия меняется.
  clear() { this.store.select([]); this.revision++; }
}
