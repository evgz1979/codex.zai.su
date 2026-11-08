import type { SourceAdapter } from './source-adapter.js';
import { AppError } from './errors.js';
//: Регистрирует рабочие источники без знания интерфейса конкретного сервиса.
//: Telegram доступен личным аккаунтам, тестовый WhatsApp — только владельцу.
export class ConnectorRegistry {
  //: Регистрирует список действующих адаптеров.
  //: Не создаёт заглушки будущих провайдеров.
  constructor(readonly adapters: SourceAdapter[]) {}
  //: Находит адаптер по точному ID экземпляра источника.
  //: Отсутствующий источник отклоняется с 409.
  get(id: string) { const a=this.adapters.find(a=>a.source.id===id); if(!a) throw new AppError(409,'Источник недоступен.'); return a; }
  //: Возвращает общие состояния зарегистрированных источников.
  //: В состояниях нет реквизитов авторизации.
  sources() { return this.adapters.map(a=>a.source); }
  //: Закрывает все зарегистрированные адаптеры.
  //: Ошибка одного источника не отменяет закрытие остальных.
  async disconnect() { await Promise.allSettled(this.adapters.map(a=>a.disconnect())); }
}
