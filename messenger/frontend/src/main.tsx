import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { App } from './App';
import {appBase} from './api';
const AdminApp=lazy(()=>import('./admin/AdminApp'));
import './styles.css';
const admin=/^\/admin\/?$/.test(location.pathname.slice(appBase.length));
if(!admin&&'serviceWorker' in navigator)void navigator.serviceWorker.register(`${appBase}/sw.js`,{scope:`${appBase}/`,updateViaCache:'none'}).catch(()=>{});
createRoot(document.getElementById('root')!).render(admin?<Suspense fallback={<p>Загрузка…</p>}><AdminApp /></Suspense>:<App />);
