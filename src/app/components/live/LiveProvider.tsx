import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeEvent } from '../../../shared/realtime';
import { meQuery } from '../../lib/auth';
import { useToast } from '../toast/Toaster';

type LiveState = {
  connected: boolean;
  /** 日付 → ハイライトを始めた時刻（ほかのメンバーが変えた日） */
  highlights: Record<string, number>;
};

const LiveContext = createContext<LiveState>({ connected: false, highlights: {} });

/** 切断中だけ使う、定期的な読み直しの間隔 */
export const FALLBACK_REFETCH_MS = 15_000;

/**
 * グループの部屋（Durable Object）と WebSocket でつながり、
 * ほかのメンバーの変更を受け取ったら該当データを読み直す。
 * 切れたら間隔を空けながら自動で再接続する。
 */
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const { data: me } = useQuery(meQuery);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [highlights, setHighlights] = useState<Record<string, number>>({});
  const handlerRef = useRef<(e: RealtimeEvent) => void>(() => {});

  // 受け取ったお知らせの処理（最新の me / toast を使うため ref に入れる）
  useEffect(() => {
    handlerRef.current = (e) => {
      const mine = e.by.id === me?.id;
      const who = `${e.by.name ?? 'メンバー'}さん`;
      switch (e.type) {
        case 'plan.updated':
          queryClient.invalidateQueries({ queryKey: ['plan', e.weekStart] });
          queryClient.invalidateQueries({ queryKey: ['today'] });
          queryClient.invalidateQueries({ queryKey: ['shopping', e.weekStart] });
          if (!mine) {
            toast(`${who}が${e.summary}`);
            const now = Date.now();
            setHighlights((h) => ({ ...h, ...Object.fromEntries(e.dates.map((d) => [d, now])) }));
          }
          break;
        case 'shopping.updated':
          queryClient.invalidateQueries({ queryKey: ['shopping', e.weekStart] });
          break;
        case 'logs.updated':
          queryClient.invalidateQueries({ queryKey: ['logs'] });
          queryClient.invalidateQueries({ queryKey: ['plan'] });
          break;
        case 'settings.updated':
          queryClient.invalidateQueries({ queryKey: ['settings'] });
          queryClient.invalidateQueries({ queryKey: ['plan'] });
          break;
        case 'recipes.updated':
          queryClient.invalidateQueries({ queryKey: ['recipes'] });
          break;
        case 'group.updated':
          queryClient.invalidateQueries({ queryKey: ['me'] });
          queryClient.invalidateQueries({ queryKey: ['group'] });
          break;
      }
    };
  }, [me?.id, queryClient, toast]);

  const groupId = me?.currentGroupId;
  useEffect(() => {
    if (!groupId) return;
    let ws: WebSocket | null = null;
    let retry = 0;
    let retryTimer: number | undefined;
    let pingTimer: number | undefined;
    let stopped = false;

    const connect = () => {
      if (stopped || document.visibilityState === 'hidden') return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/api/groups/${groupId}/live`);
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        // 接続できなかった間の変更を取り込む
        queryClient.invalidateQueries();
        pingTimer = window.setInterval(
          () => ws?.readyState === WebSocket.OPEN && ws.send('ping'),
          25_000,
        );
      };
      ws.onmessage = (m) => {
        if (typeof m.data !== 'string' || m.data === 'pong') return;
        try {
          handlerRef.current(JSON.parse(m.data) as RealtimeEvent);
        } catch {
          // 壊れたメッセージは無視
        }
      };
      ws.onclose = (ev) => {
        setConnected(false);
        window.clearInterval(pingTimer);
        if (stopped || ev.code === 4003) return; // グループから外れた
        const delay = Math.min(30_000, 1000 * 2 ** retry++);
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!ws || ws.readyState === WebSocket.CLOSED)) {
        window.clearTimeout(retryTimer);
        retry = 0;
        connect();
      }
    };

    connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      ws?.close(1000, 'leave');
      setConnected(false);
    };
  }, [groupId, queryClient]);

  const value = useMemo(() => ({ connected, highlights }), [connected, highlights]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive() {
  return useContext(LiveContext);
}

/** 切断中だけ定期的に読み直す（つながっている間はお知らせで読み直す） */
export function useFallbackRefetch() {
  return useLive().connected ? false : FALLBACK_REFETCH_MS;
}
