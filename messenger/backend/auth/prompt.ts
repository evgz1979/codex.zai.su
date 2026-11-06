import { StringDecoder } from 'node:string_decoder';
// Ввод никогда не отражается в терминале, включая api_id, телефон и коды.
export function secretPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Нужен интерактивный терминал.');
  process.stdout.write(`${label}: `);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const decoder = new StringDecoder('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
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
