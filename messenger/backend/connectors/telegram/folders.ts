import {Api,utils} from 'teleproto';
import type {Dialog} from 'teleproto/tl/custom/dialog';
import {entityId,type ConversationFolder} from '../../../shared/types.js';
//: Задаёт глобальные сроки отключения звука по категориям Telegram.
//: Применяется только при отсутствии индивидуального muteUntil у диалога.
export interface TelegramMuteDefaults {users:number;groups:number;channels:number}
//: Нормализует InputPeer в marked ID без access_hash.
//: Self разрешается по метаданным собственного диалога; неизвестные peer пропускаются.
function peerId(peer:Api.TypeInputPeer,selfId?:string):string|undefined {
  if(peer instanceof Api.InputPeerSelf)return selfId;
  if(peer instanceof Api.InputPeerEmpty)return undefined;
  return utils.getPeerId(peer);
}
//: Проверяет автоматические правила папки по метаданным диалога.
//: Явные include/exclude/pinned обрабатываются отдельно с приоритетом exclude.
function matchesRules(filter:Api.DialogFilter,d:Dialog,defaults:TelegramMuteDefaults,now:number):boolean {
  const entity=d.entity;
  const category=entity instanceof Api.User?(entity.bot?'bots':entity.contact?'contacts':'nonContacts'):entity instanceof Api.Channel&&entity.broadcast?'broadcasts':'groups';
  if(!filter[category])return false;
  const native=d.dialog;
  const archived=!!native.folderId;
  if(filter.excludeArchived&&archived)return false;
  const mention=d.unreadMentionsCount>0;
  if(filter.excludeRead&&!(d.unreadCount>0||mention||native.unreadMark))return false;
  const fallback=d.isUser?defaults.users:category==='broadcasts'?defaults.channels:defaults.groups;
  const muted=(native.notifySettings.muteUntil??fallback)>now;
  // Упоминание сохраняет muted-диалог в папке, если он не в архиве.
  return !filter.excludeMuted||!muted||(mention&&!archived);
}
//: Преобразует штатные и общие папки Telegram в безопасные общие DTO.
//: Сохраняет порядок папок/закреплений, учитывает пересечения и только известные ID.
export function telegramFolders(sourceId:string,filters:Api.TypeDialogFilter[],dialogs:Dialog[],available:ReadonlySet<string>,defaults:TelegramMuteDefaults,now=Math.floor(Date.now()/1000)):ConversationFolder[] {
  const eligible=dialogs.filter(d=>d.id&&available.has(entityId(sourceId,'conversation',d.id.toString())));
  const selfId=eligible.find(d=>d.entity instanceof Api.User&&d.entity.self)?.id?.toString();
  const result:ConversationFolder[]=[];
  for(const filter of filters){
    if(!(filter instanceof Api.DialogFilter||filter instanceof Api.DialogFilterChatlist))continue;
    const pinned=filter.pinnedPeers.map(p=>peerId(p,selfId)).filter((id):id is string=>id!==undefined);
    const include=new Set([...pinned,...filter.includePeers.map(p=>peerId(p,selfId))]);
    const exclude=new Set(filter instanceof Api.DialogFilter?filter.excludePeers.map(p=>peerId(p,selfId)):[]);
    const members=eligible.filter(d=>!exclude.has(d.id!.toString())&&(include.has(d.id!.toString())||(filter instanceof Api.DialogFilter&&matchesRules(filter,d,defaults,now))));
    const ids=new Set(members.map(d=>d.id!.toString()));
    const ordered=[...new Set([...pinned.filter(id=>ids.has(id)),...members.map(d=>d.id!.toString())])];
    result.push({id:entityId(sourceId,'folder',String(filter.id)),sourceId,title:filter.title.text||'Без названия',conversationIds:ordered.map(id=>entityId(sourceId,'conversation',id))});
  }
  return result;
}
