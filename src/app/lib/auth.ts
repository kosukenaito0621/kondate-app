import { queryOptions } from '@tanstack/react-query';
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

export async function logout() {
  await api.auth.logout.$post();
  window.location.href = '/login';
}
