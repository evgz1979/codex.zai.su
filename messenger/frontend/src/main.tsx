import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { App } from './App';
const AdminApp=lazy(()=>import('./admin/AdminApp'));
import './styles.css';
createRoot(document.getElementById('root')!).render(location.pathname.startsWith('/admin')?<Suspense fallback={<p>Загрузка…</p>}><AdminApp /></Suspense>:<App />);
