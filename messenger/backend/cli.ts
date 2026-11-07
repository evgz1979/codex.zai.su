import { secretPrompt } from './auth/prompt.js';
import { passwordHash,Auth } from './auth/auth.js';
import { Store } from './storage/store.js';
import { dataDirectory } from './config.js';
process.umask(0o077);
//: Задаёт начальные пароли локально или принимает только готовые хеши из SSH stdin.
//: Не перезаписывает существующие production-реквизиты при развёртывании.
async function main() {
  const command=process.argv[2]; const store=new Store(dataDirectory);
  try {
    if(command==='bootstrap') {
      if(new Auth(store).ready()) { console.log('Вход уже настроен.'); return; }
      const chunks:Buffer[]=[]; let size=0;
      for await(const chunk of process.stdin) { size+=chunk.length; if(size>4096)throw new Error(); chunks.push(chunk); }
      const input=JSON.parse(Buffer.concat(chunks).toString());
      if(!['admin','chat'].every(role=>typeof input[role]==='string'&&/^\$argon2id\$v=19\$m=19456,t=3,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/.test(input[role])))throw new Error();
      for(const role of ['admin','chat'])store.set(`auth.${role}`,input[role]);
      console.log('Вход настроен.');
    } else if(command==='setup') {
      for(const role of ['admin','chat']) {
        const password=await secretPrompt(`Новый пароль ${role} (16–512 символов)`);
        if(password.length<16||password.length>512||password!==await secretPrompt('Повторите пароль'))throw new Error();
        store.set(`auth.${role}`,await passwordHash(password));
      }
      console.log('Пароли сохранены. Перезапустите сервер.');
    } else if(command==='clear') { store.clearCache();console.log('Кеш очищен.'); }
    else throw new Error();
  } finally { store.close(); }
}
main().catch(()=> {console.error('Операция не выполнена. Секреты не выводятся.');process.exitCode=1;});
