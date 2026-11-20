import type { ScanOptions, ScanResult } from "./index.js";
/** The file written when the sarif input is "true", ready for github/codeql-action/upload-sarif. */
export declare const SARIF_FILE = "wormsign.sarif";
/** The inputs of the GitHub Action, read from the environment that the runner prepares. */
export interface ActionInputs {
    target: string;
    maxBranches: number;
    failOnFindings: boolean;
    sarif: boolean;
    token: string | undefined;
}
/** The ways the action talks to the runner, replaceable in tests. */
export interface ActionRunner {
    appendFile: (path: string, text: string) => void;
    writeFile: (path: string, text: string) => void;
    log: (text: string) => void;
    scan: (target: string, options: ScanOptions) => Promise<ScanResult>;
}
/** Reads every input of the action and checks them. */
export declare function readActionInputs(environment: NodeJS.ProcessEnv): ActionInputs;
/** Runs the action and returns its exit code: 1 when worms are found and fail-on-findings is on, or when the scan fails. */
export declare function runAction(environment: NodeJS.ProcessEnv, runner: ActionRunner): Promise<number>;
/** The runner used on GitHub Actions, with the real files and the real scan. */
export declare const REAL_RUNNER: ActionRunner;
