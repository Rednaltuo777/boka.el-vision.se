import app from "../server/src/app";
import { ensureSuperadminFromEnv } from "../server/src/lib/bootstrapSuperadmin";

void ensureSuperadminFromEnv();

export default app;
