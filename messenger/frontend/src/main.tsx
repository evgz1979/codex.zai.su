import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { App } from './App';
import {appBase} from './api';
const AdminApp=lazy(()=>import('./admin/AdminApp'));
import './styles.css';
createRoot(document.getElementById('root')!).render(/^\/admin\/?$/.test(location.pathname.slice(appBase.length))?<Suspense fallback={<p>Загрузка…</p>}><AdminApp /></Suspense>:<App />);
