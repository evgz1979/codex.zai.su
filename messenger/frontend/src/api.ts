let csrf = '';
//: Сохраняет CSRF-токен текущей веб-сессии в памяти модуля.
//: Значение не записывается в localStorage или URL.
export function setCsrf(value: string) { csrf = value; }
//: Передаёт HTTP-статус и безопасный текст ошибки UI.
//: Не содержит сырой HTTP-ответ или credentials Telegram.
export class ApiError extends Error {
  //: Создаёт ошибку клиентского API с HTTP-статусом.
  //: Текст берётся из безопасного поля error серверного ответа.
  constructor(public status: number, message: string) { super(message); } }
//: Выполняет same-origin JSON-запрос к фиксированному /api пути.
//: Передаёт cookie, CSRF для POST и запрещает кеширование ответа.
export async function api<T>(path: string, input?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: input === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: input === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const result = await res.json();
  if (!res.ok) throw new ApiError(res.status, result.error || 'Операция не выполнена.');
  return result;
}
