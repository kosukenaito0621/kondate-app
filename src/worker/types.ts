import type { Db } from './db/client';
import type { GroupRole } from './lib/groups';
import type { SessionUser } from './lib/session';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    db: Db;
    user: SessionUser;
    /** requireGroup が設定する、操作対象のグループ */
    group: { id: string; role: GroupRole };
  };
};
