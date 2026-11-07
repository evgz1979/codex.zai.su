import { StringDecoder } from 'node:string_decoder';
// Ввод никогда не отражается в терминале, включая api_id, телефон и коды.
//: Читает секрет из интерактивного терминала без эха.
//: Требует TTY; Ctrl+C и Ctrl+D отменяют ввод и восстанавливают режим терминала.
export function secretPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Нужен интерактивный терминал.');
  process.stdout.write(`${label}: `);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const decoder = new StringDecoder('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    //: Завершает захват клавиатурного ввода.
    //: Снимает listener, raw mode и приостанавливает stdin.
    const finish = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    //: Обрабатывает скрытые символы, удаление и завершение строки.
    //: Декодирует UTF-8 без вывода содержимого в терминал.
    const onData = (bytes: Buffer) => {
      for (const char of decoder.write(bytes)) {
        if (char === '\u0003' || char === '\u0004') { finish(); reject(new Error('Отменено.')); return; }
        if (char === '\r' || char === '\n') { finish(); resolve(value); return; }
        if (char === '\u007f' || char === '\b') value = [...value].slice(0,-1).join('');
        else if (char >= ' ') value += char;
      }
    };
    process.stdin.on('data', onData);
  });
}
