import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Api, type TelegramClient } from 'teleproto';
import { TelegramAdapter } from '../backend/connectors/telegram/adapter.js';
import { SecretVault } from '../backend/storage/private-files.js';
import { destinationFor } from '../shared/types.js';
test('Telegram: DTO, фильтр broadcast, уникальность message ID и буквальная отправка', async () => {
  const dir = mkdtempSync(join(tmpdir(),'zai-messenger-telegram-'));
  const vault = new SecretVault(dir);
  vault.save({ apiId:123, apiHash:'test-only', session:'test-only' });
  const user = new Api.User({ id:123n as never, firstName:'Тест' });
  const group = new Api.Chat({ id:456n as never, title:'Группа', photo:new Api.ChatPhotoEmpty(), participantsCount:2, date:0, version:1 });
  const dialogs = [user,group,user].map((entity,i) => ({
    entity, id:{toString:() => String(i)}, title:`Диалог ${i}`, inputEntity:new Api.InputPeerSelf(),
    isUser:i === 0, isGroup:i === 1, isChannel:i === 2, isCommunity:false, unreadCount:2,date:123,
  }));
  const message = () => {
    const m = new Api.Message({ id:1,peerId:new Api.PeerUser({userId:123n as never}),date:123,message:'<b>буквальный</b>' });
    m._sender = user;
    return m;
  };
  let sentOptions: Record<string,unknown> = {};
  let requestedLimit = 0;
  const fake = {
    connected:false, async connect(){ this.connected = true; }, async checkAuthorization(){ return true; }, async destroy(){ this.connected = false; },
    async getDialogs(){return dialogs;},
    async getMessages(_peer: unknown, options: {limit:number}){ requestedLimit = options.limit; return [message()]; },
    async sendMessage(_peer: unknown, options: Record<string,unknown>){ sentOptions = options; const m = message(); m.out = true; return m; },
    async markAsRead(){return true;},
  };
  const adapter = new TelegramAdapter(vault,() => fake as unknown as TelegramClient);
  try {
    const conversations = await adapter.listConversations();
    assert.equal(conversations.length,2); assert.equal(conversations[1].kind,'group');
    const a = await adapter.recentMessages(conversations[0].id,1000);
    const b = await adapter.recentMessages(conversations[1].id,1000);
    assert.equal(requestedLimit,40); assert.notEqual(a[0].id,b[0].id);
    assert.equal(a[0].sender.name,'Тест'); assert.equal(a[0].status,'received');
    await assert.rejects(adapter.sendText({...destinationFor(conversations[0]),recipientId:'wrong'},'x'),/Invalid destination/);
    const sent = await adapter.sendText(destinationFor(conversations[0]),'**буквальный текст**');
    assert.equal(sent.status,'sent'); assert.deepEqual(sentOptions.formattingEntities,[]);
    assert.equal(sentOptions.linkPreview,false); assert.equal(sentOptions.message,'**буквальный текст**');
    await adapter.markRead(conversations[0].id,a[0].id);
  } finally { await adapter.disconnect(); rmSync(dir,{recursive:true,force:true}); }
});
