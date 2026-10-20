import { queryOptions, useQuery } from '@tanstack/react-query';
import type { Me } from '../../shared/schemas';
import { api } from '../api';

/** ログイン中のユーザー。未ログインなら null */
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async (): Promise<Me | null> => {
    const res = await api.me.$get();
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`me: ${res.status}`);
    return res.json();
  },
  staleTime: 5 * 60_000,
});

/** お試し中（ログインせずに試している）か */
export function useIsGuest() {
  return useQuery(meQuery).data?.guestUntil != null;
}

/** オフライン用に端末へ保存した API の応答と写真（サービスワーカーのキャッシュ名は vite.config.ts と合わせる） */
const PRIVATE_CACHES = ['kd-api', 'kd-images'];

export async function logout() {
  await api.auth.logout.$post();
  // 共用の端末で、前の人の献立や写真が残らないようにする
  if ('caches' in window) await Promise.all(PRIVATE_CACHES.map((n) => caches.delete(n)));
  window.location.href = '/login';
}
