let csrf = '';
export function setCsrf(value: string) { csrf = value; }
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
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
