import {useId,useRef,useState,type KeyboardEvent} from 'react';
import {LIMITS,type AdminDialogCatalog} from '../../../shared/types';
//: Задаёт управляемый выбор диалогов без привязки к конкретному источнику.
//: Папки фильтруют отображение; onSave получает общий выбор через родителя.
interface Props {catalog:AdminDialogCatalog;selected:string[];busy:boolean;onChange(ids:string[]):void;onSave():void}
//: Показывает папки источника отдельными закладками над таблицей диалогов.
//: Переключение и поиск сохраняют выбор в скрытых папках и не загружают историю.
export default function ConversationPicker({catalog,selected,busy,onChange,onSave}:Props) {
  const [folderId,setFolderId]=useState('');const [query,setQuery]=useState('');
  const prefix=useId();const refs=useRef<(HTMLButtonElement|null)[]>([]);
  const tabs=[{id:'',title:'Все диалоги',conversationIds:catalog.conversations.map(c=>c.id)},...catalog.folders];
  const index=Math.max(0,tabs.findIndex(f=>f.id===folderId));const current=tabs[index];
  const byId=new Map(catalog.conversations.map(c=>[c.id,c]));
  const visible=current.conversationIds.flatMap(id=>{const c=byId.get(id);return c&&c.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())?[c]:[];});
  const chosen=new Set(selected);
  //: Переключает закладки стрелками, Home и End с переносом фокуса.
  //: Мышь и клавиатура изменяют только текущую папку, без изменения разрешений.
  function navigate(e:KeyboardEvent<HTMLButtonElement>,at:number) {
    const target=e.key==='ArrowRight'?(at+1)%tabs.length:e.key==='ArrowLeft'?(at+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:undefined;
    if(target===undefined)return;e.preventDefault();setFolderId(tabs[target].id);refs.current[target]?.focus();
  }
  return <>
    <p className="admin-notice">Новые личные контакты добавляются по входящему сообщению. Снятая галочка сохраняет исключение.</p>
    {catalog.truncated&&<p role="status">Показаны первые 1000 диалогов. Состав папок ограничен загруженным каталогом.</p>}
    <div className="admin-folders" role="tablist" aria-label="Папки диалогов">{tabs.map((folder,i)=><button key={folder.id} ref={node=>{refs.current[i]=node;}} type="button" role="tab" id={`${prefix}-tab-${i}`} aria-label={folder.title} aria-selected={i===index} aria-controls={`${prefix}-panel`} tabIndex={i===index?0:-1} onClick={()=>setFolderId(folder.id)} onKeyDown={e=>navigate(e,i)}>{folder.title}<span aria-hidden="true">{folder.conversationIds.length}</span></button>)}</div>
    <section role="tabpanel" id={`${prefix}-panel`} aria-labelledby={`${prefix}-tab-${index}`}>
      <div className="admin-selection"><label>Поиск по названию<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label><span>Выбрано: {selected.length} / {LIMITS.conversations} · загружено: {catalog.conversations.length} · показано: {visible.length}</span><button disabled={busy} onClick={onSave}>Сохранить выбор</button></div>
      {visible.length?<div className="admin-table"><table><thead><tr><th>Выбор</th><th>Диалог</th><th>Тип</th><th>Отправка</th></tr></thead><tbody>{visible.map(c=><tr key={c.id}><td><input aria-label={`Разрешить: ${c.title}`} type="checkbox" disabled={busy} checked={chosen.has(c.id)} onChange={e=>onChange(e.target.checked?[...selected,c.id]:selected.filter(id=>id!==c.id))}/></td><td>{c.title}</td><td>{c.kind==='direct'?'Личный':c.kind==='group'?'Группа':'Канал'}</td><td>{c.canSend?'Разрешена':'Только чтение'}</td></tr>)}</tbody></table></div>:<p role="status">В этой папке нет загруженных диалогов{query.trim()?' по запросу':''}.</p>}
    </section>
  </>;
}
