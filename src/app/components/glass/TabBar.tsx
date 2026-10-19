import { useQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { unreadNewsCount } from '../../../shared/news';
import { meQuery } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';
import { BookIcon, CalendarIcon, CartIcon, GearIcon, HomeIcon } from '../icons';

const TABS = [
  { to: '/', label: 'ホーム', Icon: HomeIcon },
  { to: '/week', label: '週間献立', Icon: CalendarIcon },
  { to: '/shopping', label: '買い物', Icon: CartIcon },
  { to: '/recipes', label: 'レシピ', Icon: BookIcon },
  { to: '/settings', label: '設定', Icon: GearIcon },
] as const;

function isActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
}

/** 親指で届く、下部フローティングのガラス調タブバー */
export function TabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: me } = useQuery(meQuery);
  const unread = me ? unreadNewsCount(me.newsSeen) : 0;

  return (
    <nav
      aria-label="メインメニュー"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3"
      style={{ paddingBottom: 'max(0.75rem, var(--safe-bottom))' }}
    >
      <ul className="glass glass--strong pointer-events-auto flex w-full max-w-[calc(var(--app-max-width)-1.5rem)] items-stretch justify-between rounded-[1.75rem] p-1.5">
        {TABS.map(({ to, label, Icon }) => {
          const active = isActive(pathname, to);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[1.35rem] text-[10.5px] font-medium transition-colors',
                  active ? 'font-bold text-accent-strong' : 'text-ink-soft',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tab-indicator"
                    className="pill-active absolute inset-0 rounded-[1.35rem]"
                    transition={spring.soft}
                  />
                )}
                <motion.span
                  className="relative"
                  animate={{ y: active ? -1 : 0, scale: active ? 1.08 : 1 }}
                  transition={spring.snappy}
                >
                  <Icon size={22} strokeWidth={active ? 2.1 : 1.8} />
                </motion.span>
                <span className="relative">{label}</span>
                {to === '/settings' && unread > 0 && (
                  <span
                    className="absolute right-[22%] top-2 size-2.5 rounded-full bg-danger ring-2 ring-canvas"
                    aria-label={`未読のお知らせ ${unread}件`}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
