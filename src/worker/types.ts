import type { Db } from './db/client';
import type { SessionUser } from './lib/session';

export type AppEnv = {
  Bindings: Env;
  Variables: { db: Db; user: SessionUser };
};
