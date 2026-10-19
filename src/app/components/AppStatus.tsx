import { AnimatePresence, motion } from 'motion/react';
import { useSyncExternalStore } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { spring } from '../lib/motion';
import { GlassButton } from './glass/GlassButton';

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/**
 * 画面下（タブバーの上）に出るお知らせ。
 * - 新しいバージョンが届いたら「更新」ボタン（入力途中で勝手に再読み込みしない）
 * - 電波がないときは、前に読み込んだ内容を表示中であることを伝える
 */
export function AppStatus() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // 開きっぱなしでも1時間ごとに更新を確認する
      if (reg) window.setInterval(() => reg.update(), 60 * 60_000);
    },
  });

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[55] flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(var(--tabbar-height) + var(--safe-bottom) + 1rem)' }}
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {!online && (
          <motion.p
            key="offline"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={spring.soft}
            className="glass glass--strong rounded-full px-4 py-2 text-xs font-bold text-sub-ink"
          >
            オフライン中です。チェックは電波が戻ったら保存されます
          </motion.p>
        )}
        {needRefresh && (
          <motion.div
            key="update"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={spring.soft}
            className="glass glass--strong pointer-events-auto flex w-full max-w-[24rem] items-center gap-3 rounded-2xl py-2 pl-4 pr-2 text-sm font-bold"
          >
            <span className="flex-1">新しいバージョンがあります</span>
            <GlassButton size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
              あとで
            </GlassButton>
            <GlassButton size="sm" variant="primary" onClick={() => updateServiceWorker(true)}>
              更新
            </GlassButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
