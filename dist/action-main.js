import { REAL_RUNNER, runAction } from "./action.js";
process.exitCode = await runAction(process.env, REAL_RUNNER);
