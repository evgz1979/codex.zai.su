import type { Snapshot } from '../../shared/types.js';
import type { ConversationSelectionService } from './selection.js';
//: Формирует публичный снимок только разрешённых диалогов.
//: Фильтрация выполняется при каждом ответе, в том числе после изменения выбора.
export class UnifiedInboxService {
  //: Подключает серверный сервис выбора диалогов.
  //: Видимость сообщений не определяется клиентским фильтром.
  constructor(private selection: ConversationSelectionService) {}
  //: Отбирает разрешённые диалоги и связанные сообщения.
  //: Повторно читает выбор на каждом ответе, включая выдачу кеша.
  filter(state: Snapshot): Snapshot {
    const ids=new Set(this.selection.ids());
    const conversations=state.conversations.filter(c=>ids.has(c.id));
    const active=new Set(conversations.map(c=>c.id));
    return { ...state,conversations,messages:state.messages.filter(m=>active.has(m.conversationId)) };
  }
}
