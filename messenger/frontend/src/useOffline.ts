import {useSyncExternalStore} from 'react';
import {isOffline,subscribeConnection} from './api';
//: Обновляет режим чтения после потери сети и подтверждённого восстановления сервера.
//: Состояние связи не сбрасывает открытую переписку или черновик.
export function useOffline(){return useSyncExternalStore(subscribeConnection,isOffline);}
