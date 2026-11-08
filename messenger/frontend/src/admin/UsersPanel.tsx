import {useEffect,useState,type FormEvent} from 'react';
import type {AccountInfo} from '../../../shared/types';
import {PASSWORD_LIMITS} from '../../../shared/types';
import {api} from '../api';

//: Дополняет публичное имя состоянием доступа для панели владельца.
//: Не содержит пароли, Telegram-аккаунты или личные переписки пользователей.
type ManagedUser=AccountInfo&{enabled:boolean};
//: Управляет закрытым списком личных пользователей и выдаёт персональные ссылки.
//: Сервер отдельно проверяет владельца; новый пользователь сам подключает Telegram.
export default function UsersPanel(){
  const [users,setUsers]=useState<ManagedUser[]>([]);
  const [username,setUsername]=useState('');const [displayName,setDisplayName]=useState('');const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  //: Получает только имена и состояния зарегистрированных пользователей.
  //: Не загружает статусы источников и данные чужих Telegram.
  async function load(){const result=await api<{users:ManagedUser[]}>('users');setUsers(result.users);}
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Не удалось получить пользователей.'));},[]);
  //: Выполняет изменение закрытого списка и обновляет панель.
  //: Ошибки отображаются без журналирования секретных полей.
  async function run(task:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await task();await load();}catch(e){setError(e instanceof Error?e.message:'Операция не выполнена.');}finally{setBusy(false);}}
  //: Создаёт личный Messenger и очищает начальный пароль перед ожиданием ответа.
  //: Один начальный пароль открывает чат и личные настройки; затем роли меняются отдельно.
  function create(event:FormEvent){event.preventDefault();const input={username,displayName,password};setPassword('');void run(async()=>{await api('users/create',input);setUsername('');setDisplayName('');setNotice('Пользователь добавлен. Передайте ему ссылку и начальный пароль.');});}
  return <>
    {error&&<p className="admin-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <section className="admin-card"><h2>Пользователи</h2>
      <ul className="user-list">{users.map(user=><li key={user.id}><div><strong>{user.displayName}</strong> <span>@{user.username}</span><p>{user.isOwner?'Владелец':user.enabled?'Доступ разрешён':'Доступ заблокирован'}</p><a href={user.path||(user.isOwner?'/':`/u/${user.username}/`)} target="_blank" rel="noreferrer">{`${location.origin}${user.path||(user.isOwner?'/':`/u/${user.username}/`)}`}</a></div>{!user.isOwner&&<button className={user.enabled?'danger':''} disabled={busy} onClick={()=>void run(async()=>{await api('users/access',{id:user.id,enabled:!user.enabled});})}>{user.enabled?'Заблокировать':'Разрешить доступ'}</button>}</li>)}</ul>
    </section>
    <section className="admin-card"><h2>Добавить пользователя</h2><form onSubmit={create} autoComplete="off">
      <label>Имя пользователя в ссылке<input required value={username} onChange={e=>setUsername(e.target.value)} pattern="[a-z][a-z0-9_-]{1,31}" minLength={2} maxLength={32} autoCapitalize="none" spellCheck={false} placeholder="anna"/></label>
      <label>Имя на главной<input required value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={80} placeholder="Анна"/></label>
      <label>Начальный пароль<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} minLength={PASSWORD_LIMITS.min} maxLength={PASSWORD_LIMITS.max} autoComplete="new-password"/></label>
      <p>Пароль для чата и личных настроек. Пользователь подключает свой Telegram в настройках. Доступно до четырёх личных пользователей.</p><button disabled={busy||users.length>=5}>Добавить</button>
    </form></section>
  </>;
}
