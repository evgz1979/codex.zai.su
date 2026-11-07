import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TelegramLogin} from '../backend/auth/telegram-login.js';
import {telegramAuthIssue} from '../backend/auth/telegram-issue.js';
import {SecretVault} from '../backend/storage/private-files.js';
import {telegramAuthIssueText} from '../shared/types.js';
import {telegramClient} from '../backend/connectors/telegram/client.js';
import {Api,errors} from 'teleproto';
import type {UserAuthParams} from 'teleproto/client/auth';
//: Создаёт временный vault только для синтетических реквизитов.
//: Удаляет файлы после сценария, не обращаясь к рабочему хранилищу.
function context(t:{after(fn:()=>void):void}) {const dir=mkdtempSync(join(tmpdir(),'zai-auth-'));const vault=new SecretVault(dir);t.after(()=>rmSync(dir,{recursive:true,force:true}));return {vault};}
test('Telegram: ошибки начального запроса классифицируются без исходных исключений',async t=>{
 const {vault}=context(t);
 const secrets='synthetic-secret-phone-api-hash-code';
 for(const [rpc,expected] of [['API_ID_INVALID','invalid_api'],['PHONE_NUMBER_FLOOD','rate_limited'],['PHONE_NUMBER_INVALID','invalid_phone'],['UPDATE_APP_TO_LOGIN','update_required']]){
  const fake={async start(){throw Object.assign(new Error(secrets),{errorMessage:rpc,request:{phone:secrets}});},async destroy(){}};
  const login=new TelegramLogin(vault,(()=>fake) as unknown as typeof telegramClient);
  assert.equal(await login.begin({apiId:123,apiHash:'1'.repeat(32),phone:'+79990000000'}),'error');
  assert.equal(login.issue?.code,expected);assert.ok(!JSON.stringify(login.issue).includes(secrets));assert.ok(!telegramAuthIssueText(login.issue!).includes(secrets));
 }
 assert.deepEqual(telegramAuthIssue(new Error(secrets)),{code:'unknown'});
 const flood=telegramAuthIssue({name:'FloodWaitError',seconds:97,message:secrets});
 assert.deepEqual(flood,{code:'rate_limited',retryAfterSeconds:97});assert.match(telegramAuthIssueText(flood),/97/);
});
test('Telegram: пять неверных кодов завершают вход без нового sendCode',async t=>{
 const {vault}=context(t);let sends=0;let verifies=0;
 const factory:typeof telegramClient=(credentials)=>{
  const client=telegramClient(credentials);
  client.start=async params=>{await client.signInUser({apiId:credentials.apiId,apiHash:credentials.apiHash},params as UserAuthParams);};
  client.invoke=(async(request:Api.AnyRequest)=>{
   if(request instanceof Api.auth.SendCode){sends++;return new Api.auth.SentCode({type:new Api.auth.SentCodeTypeApp({length:5}),phoneCodeHash:'synthetic-phone-code-hash'});}
   if(request instanceof Api.auth.SignIn){verifies++;throw new errors.PhoneCodeInvalidError({request});}
   throw new Error('unexpected synthetic request');
  }) as typeof client.invoke;
  return client;
 };
 const login=new TelegramLogin(vault,factory);
 assert.equal(await login.begin({apiId:123,apiHash:'1'.repeat(32),phone:'+79990000000'}),'code');
 for(let attempt=1;attempt<=5;attempt++)assert.equal(await login.submit('code','11111'),attempt<5?'code':'error');
 assert.equal(sends,1);assert.equal(verifies,5);assert.deepEqual(login.issue,{code:'invalid_code'});assert.equal(vault.exists(),false);
 await assert.rejects(()=>login.submit('code','11111'),/недоступен/);
});
test('Telegram: ошибка фабрики не оставляет вечный connecting и не блокирует новый вход',async t=>{
 const {vault}=context(t);const factory=(()=>{throw new Error('synthetic-private-input');}) as typeof telegramClient;
 const login=new TelegramLogin(vault,factory);
 for(let i=0;i<2;i++){assert.equal(await login.begin({apiId:123,apiHash:'1'.repeat(32),phone:'+79990000000'}),'error');assert.deepEqual(login.issue,{code:'unknown'});}
});
test('Telegram: настоящая оркестрация teleproto сохраняет причину sendCode',async t=>{
 const {vault}=context(t);
 const factory:typeof telegramClient=(credentials)=>{
  const client=telegramClient(credentials);
  client.start=async params=>{await client.signInUser({apiId:credentials.apiId,apiHash:credentials.apiHash},params as UserAuthParams);};
  client.invoke=async()=>{throw new errors.ApiIdInvalidError({request:undefined});};
  return client;
 };
 const login=new TelegramLogin(vault,factory);
 assert.equal(await login.begin({apiId:123,apiHash:'1'.repeat(32),phone:'+79990000000'}),'error');
 assert.equal(login.issue?.code,'invalid_api');assert.equal(vault.exists(),false);
});
test('Telegram: неверный код повторяется на том же запросе, затем доступен 2FA',async t=>{
 const {vault}=context(t);let sendCodeCalls=0;let signInCalls=0;let passwordCalls=0;
 const user=new Api.User({id:47n as never,firstName:'Synthetic'});
 const factory:typeof telegramClient=(credentials)=>{
  const client=telegramClient(credentials);
  client.start=async params=>{await client.signInUser({apiId:credentials.apiId,apiHash:credentials.apiHash},params as UserAuthParams);};
  client.checkAuthorization=async()=>true;client.getMe=(async()=>user) as typeof client.getMe;
  // Не сохраняем синтетический MTProto-ключ; успешное сохранение отдельно проверено.
  client.session.save=()=>'synthetic-session';
  client.invoke=(async(request:Api.AnyRequest)=>{
   if(request instanceof Api.auth.SendCode){sendCodeCalls++;return new Api.auth.SentCode({type:new Api.auth.SentCodeTypeApp({length:5}),phoneCodeHash:'synthetic-phone-code-hash'});}
   if(request instanceof Api.auth.SignIn){signInCalls++;if(signInCalls===1)throw new errors.PhoneCodeInvalidError({request});throw Object.assign(new Error('2FA needed'),{errorMessage:'SESSION_PASSWORD_NEEDED'});}
   throw new Error('unexpected synthetic request');
  }) as typeof client.invoke;
  client.signInWithPassword=async(_credentials,params)=>{
   const first=await params.password!();passwordCalls++;
   assert.equal(first,'synthetic-wrong');await params.onError(new errors.PasswordHashInvalidError({request:undefined}));
   const second=await params.password!();passwordCalls++;assert.equal(second,'synthetic-correct');return user;
  };
  return client;
 };
 const login=new TelegramLogin(vault,factory);
 assert.equal(await login.begin({apiId:123,apiHash:'1'.repeat(32),phone:'+79990000000'}),'code');
 assert.equal(await login.submit('code','11111'),'code');assert.equal(login.issue?.code,'invalid_code');assert.equal(sendCodeCalls,1);
 assert.equal(await login.submit('code','22222'),'password');assert.equal(login.issue,undefined);
 assert.equal(await login.submit('password','synthetic-wrong'),'password');assert.deepEqual(login.issue,{code:'invalid_password'});
 assert.equal(await login.submit('password','synthetic-correct'),'connected');assert.equal(login.issue,undefined);assert.equal(sendCodeCalls,1);assert.equal(passwordCalls,2);
});
