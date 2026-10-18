import { createRng } from '../../shared/planner/random';

export type GreetingContext = {
  name: string;
  /** JST の時（0-23） */
  hour: number;
  /** 0=月 … 6=日 */
  weekday: number;
  /** 今日の主菜名（献立がなければ undefined） */
  mainDish?: string;
  timeLevel?: 'quick' | 'normal' | 'slow';
  budgetLevel?: 'save' | 'normal' | 'rich';
  level?: 'futaba' | 'minori';
  hasPlan: boolean;
  /** 同じ日・同じ時間帯なら同じ文言にするための種 */
  seed: number;
};

export type TimeBand = 'morning' | 'day' | 'evening' | 'night';

export function timeBand(hour: number): TimeBand {
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 17) return 'day';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

const TITLES: Record<TimeBand, ((n: string) => string)[]> = {
  morning: [
    (n) => `おはようございます、${n}さん`,
    (n) => `おはよう、${n}さん`,
    (n) => `${n}さん、おはようございます`,
  ],
  day: [
    (n) => `こんにちは、${n}さん`,
    (n) => `${n}さん、こんにちは`,
    (n) => `こんにちは、${n}さん。いい午後を`,
  ],
  evening: [
    (n) => `こんばんは、${n}さん`,
    (n) => `${n}さん、今日もおつかれさま`,
    (_n) => 'こんばんは。今日もおつかれさま',
  ],
  night: [
    (n) => `夜遅くまでおつかれさま、${n}さん`,
    (n) => `${n}さん、遅くまでおつかれさま`,
    (n) => `おつかれさまです、${n}さん`,
  ],
};

/** 曜日ごとの一言（0=月 … 6=日。アプリ全体の曜日番号に合わせる） */
const WEEKDAY_LINES: Record<number, string[]> = {
  0: ['新しい一週間のはじまりです', '月曜日、ゆるっといきましょう'],
  1: ['火曜日、ペースをつかんでいきましょう'],
  2: ['週の真ん中、ひと息つきましょう'],
  3: ['木曜日、週末まであと少し'],
  4: ['金曜日、今週もよくがんばりました', '花の金曜日です'],
  5: ['土曜日。のんびり作るのもいいですね', '週末のごはん、楽しみましょう'],
  6: ['日曜日。ゆっくり台所に立てる日ですね', '週末の締めくくり、おいしいごはんで'],
};

function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length)]!;
}

/** 時間帯の挨拶と、曜日や献立にふれた一言 */
export function greeting(ctx: GreetingContext): { title: string; line: string } {
  const rng = createRng(ctx.seed);
  const band = timeBand(ctx.hour);
  const title = pick(TITLES[band], rng)(ctx.name);

  const lines: string[] = [];
  if (!ctx.hasPlan) {
    lines.push('まだ今日の献立がありません。1週間分をまとめて作りましょう');
  } else {
    if (ctx.timeLevel === 'quick') lines.push('今日は時短デーです。20分以内で作れるメニューです');
    if (ctx.budgetLevel === 'save') lines.push('今日は節約デー。やさしいお値段のメニューです');
    if (ctx.level === 'futaba') lines.push('今日は手順が少なく、作りやすいメニューです');
    if (ctx.timeLevel === 'slow') lines.push('今日はじっくり。手をかけた料理を楽しみましょう');
    if (ctx.mainDish) {
      lines.push(
        band === 'morning' || band === 'day'
          ? `今夜は「${ctx.mainDish}」の予定です`
          : `今日は「${ctx.mainDish}」です`,
      );
    }
    lines.push(...(WEEKDAY_LINES[ctx.weekday] ?? []));
  }
  return { title, line: pick(lines, rng) };
}
