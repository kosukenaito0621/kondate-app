import { queryOptions, type QueryClient } from '@tanstack/react-query';
import type { GroupDetail, InviteSummary } from '../../shared/groups';
import { api } from '../api';
import { meQuery } from './auth';
import { ok } from './recipes';

export const currentGroupQuery = queryOptions({
  queryKey: ['group', 'current'],
  queryFn: async () => ok<GroupDetail>(await api.groups.current.$get()),
  staleTime: 30_000,
});

export const invitesQuery = (groupId: string) =>
  queryOptions({
    queryKey: ['group', groupId, 'invites'],
    queryFn: async () =>
      ok<InviteSummary[]>(await api.groups[':id'].invites.$get({ param: { id: groupId } })),
  });

/** 使うグループを切り替え、グループ単位のデータをすべて取り直す */
export async function switchGroup(queryClient: QueryClient, groupId: string) {
  const res = await api.groups[':id'].switch.$post({ param: { id: groupId } });
  if (!res.ok) throw new Error('切り替えられませんでした');
  await queryClient.invalidateQueries();
  await queryClient.fetchQuery(meQuery);
}

export function inviteUrl(token: string) {
  return `${window.location.origin}/invite/${token}`;
}
