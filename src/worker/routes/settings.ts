import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { updateSettingsSchema, type PlanSettings } from '../../shared/plan';
import type { Db } from '../db/client';
import { daySettings, groups } from '../db/schema';
import { memberCount } from '../lib/groups';
import { requireAuth } from '../middleware/auth';
import { requireGroup } from '../middleware/group';
import { notifyGroup } from '../realtime/notify';
import type { AppEnv } from '../types';

export async function loadSettings(db: Db, groupId: string): Promise<PlanSettings> {
  const g = await db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!g) throw new Error('group not found');
  const rows = await db.select().from(daySettings).where(eq(daySettings.groupId, groupId));
  const days = Array.from({ length: 7 }, (_, weekday) => {
    const r = rows.find((x) => x.weekday === weekday);
    return {
      weekday,
      budgetLevel: r?.budgetLevel ?? 'normal',
      timeLevel: r?.timeLevel ?? 'normal',
      sideMode: r?.sideMode ?? 'auto',
      level: r?.level ?? 'inherit',
    } as const;
  });
  return {
    weeklyBudget: g.weeklyBudget,
    ratio: { wa: g.ratioWa, yo: g.ratioYo, chu: g.ratioChu },
    buySeasonings: g.buySeasonings,
    defaultLevel: g.defaultLevel,
    servings: g.servings ?? Math.max(1, await memberCount(db, groupId)),
    days: [...days],
  };
}

export const settingsRoutes = new Hono<AppEnv>()
  .use(requireAuth, requireGroup)
  .get('/', async (c) => c.json(await loadSettings(c.var.db, c.var.group.id)))
  .put('/', zValidator('json', updateSettingsSchema), async (c) => {
    const { weeklyBudget, ratio, buySeasonings, days } = c.req.valid('json');
    const db = c.var.db;
    const groupId = c.var.group.id;
    const groupPatch = {
      ...(weeklyBudget !== undefined && { weeklyBudget }),
      ...(ratio && { ratioWa: ratio.wa, ratioYo: ratio.yo, ratioChu: ratio.chu }),
      ...(buySeasonings && { buySeasonings }),
    };
    const ops = [];
    if (Object.keys(groupPatch).length) {
      ops.push(db.update(groups).set(groupPatch).where(eq(groups.id, groupId)));
    }
    for (const d of days ?? []) {
      const { weekday, ...rest } = d;
      ops.push(
        db
          .insert(daySettings)
          .values({ groupId, weekday, ...rest })
          .onConflictDoUpdate({ target: [daySettings.groupId, daySettings.weekday], set: rest }),
      );
    }
    if (ops.length) {
      await db.batch(ops as [(typeof ops)[number], ...typeof ops]);
      notifyGroup(c, { type: 'settings.updated' });
    }
    return c.json(await loadSettings(db, groupId));
  });
