import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {hash,Algorithm} from '../../messenger/node_modules/@node-rs/argon2/index.js';
// Only generates initial credentials; never reads or prints an existing credential file.
const directory=process.env.MESSENGER_BOOTSTRAP_DIR||resolve(homedir(),'Library/Application Support/Z AI Messenger/deploy');mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
const target=resolve(directory,'initial-credentials.txt');
if(!existsSync(target)) {
 const admin=randomBytes(24).toString('base64url');const chat=randomBytes(24).toString('base64url');
 const options={algorithm:Algorithm.Argon2id,memoryCost:19456,timeCost:3,parallelism:1};
 const hashes={admin:await hash(admin,options),chat:await hash(chat,options)};
 writeFileSync(resolve(directory,'bootstrap.json'),JSON.stringify(hashes),{mode:0o600,flag:'wx'});
 writeFileSync(target,`Админка https://msg.zai.su:8443/admin\nПароль: ${admin}\n\nЧат https://msg.zai.su:8443/\nПароль: ${chat}\n`,{mode:0o600,flag:'wx'});
}
console.log('Начальные реквизиты сохранены вне Git; значения не выводятся.');
