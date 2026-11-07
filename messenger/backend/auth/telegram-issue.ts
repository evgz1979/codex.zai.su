import type { TelegramAuthIssue, TelegramAuthIssueCode } from '../../shared/types.js';
//: Переводит исключение Telegram в ограниченную безопасную категорию.
//: Не возвращает исходный message, request, стек, телефон, код или ключи.
export function telegramAuthIssue(error: unknown): TelegramAuthIssue {
  const value = error && typeof error === 'object' ? error as Record<string,unknown> : {};
  const rpc = typeof value.errorMessage === 'string' ? value.errorMessage : '';
  const known: Record<string,TelegramAuthIssueCode> = {
    API_ID_INVALID:'invalid_api', API_HASH_INVALID:'invalid_api', CONNECTION_API_ID_INVALID:'invalid_api',
    API_ID_PUBLISHED_FLOOD:'api_blocked', PHONE_NUMBER_INVALID:'invalid_phone', PHONE_NUMBER_BANNED:'phone_blocked',
    PHONE_NUMBER_UNOCCUPIED:'account_missing', PHONE_NUMBER_APP_SIGNUP_FORBIDDEN:'account_missing',
    PHONE_CODE_INVALID:'invalid_code', PHONE_CODE_EMPTY:'invalid_code', PASSWORD_HASH_INVALID:'invalid_password',
    PHONE_CODE_EXPIRED:'code_expired', PHONE_HASH_EXPIRED:'code_expired', PHONE_CODE_HASH_EMPTY:'code_expired',
    PHONE_NUMBER_FLOOD:'rate_limited', PHONE_PASSWORD_FLOOD:'rate_limited',
    UPDATE_APP_TO_LOGIN:'update_required', AUTH_RESTART:'restart_required',
    SMS_CODE_CREATE_FAILED:'telegram_unavailable', SIGN_IN_FAILED:'telegram_unavailable',
  };
  if (Object.hasOwn(known,rpc)) return {code:known[rpc]};
  if (value.name === 'FloodWaitError' || value.name === 'FloodTestPhoneWaitError' || /^FLOOD_(?:WAIT|TEST_PHONE_WAIT)_\d+$/.test(rpc)) {
    const seconds = typeof value.seconds === 'number' ? value.seconds : Number(rpc.split('_').at(-1));
    return {code:'rate_limited',...(Number.isSafeInteger(seconds)&&seconds>0&&seconds<=31536000?{retryAfterSeconds:seconds}:{})};
  }
  if (value.name === 'TimeoutError' || rpc === 'Timeout' || value.code === 'ETIMEDOUT') return {code:'network_timeout'};
  if (['ECONNRESET','ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','ENOTFOUND'].includes(String(value.code))) return {code:'network_error'};
  if (/^RECAPTCHA_/.test(rpc)) return {code:'captcha_required'};
  if (/^AUTH_RESTART_\d+$/.test(rpc)) return {code:'restart_required'};
  // Только точные константы установленной teleproto, без вывода текста исключения.
  if (value.message === 'Telegram requires a login email for this account: pass emailAddress and emailVerification to sign in' || value.message === 'Telegram sent the login code to the account email: pass emailVerification to sign in') return {code:'email_required'};
  if (value.message === 'Telegram requires a payment to send the login code to this number, which only official apps support') return {code:'official_app_required'};
  if (value.message === 'No account is registered with this phone number: pass firstAndLastNames to sign up') return {code:'account_missing'};
  if (value.message === 'AUTH_USER_CANCEL') return {code:'cancelled'};
  return {code:'unknown'};
}
