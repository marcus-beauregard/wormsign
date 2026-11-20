import { appendFileSync, writeFileSync } from "node:fs";
import { VERSION } from "./cli.js";
import { formatMarkdown, formatSarif, formatText, isWormSign, scan } from "./index.js";
import type { ScanOptions, ScanResult } from "./index.js";

/** The file written when the sarif input is "true", ready for github/codeql-action/upload-sarif. */
export const SARIF_FILE = "wormsign.sarif";

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

/** Reads one input of the action; the runner names it INPUT_ followed by its name in capitals. */
function readInput(environment: NodeJS.ProcessEnv, name: string): string {
  const key = `INPUT_${name.toUpperCase()}`;
  return (environment[key] ?? "").trim();
}

/** Reads an input written "true" or "false", with a default value when it is empty. */
function readSwitch(environment: NodeJS.ProcessEnv, name: string, defaultValue: boolean): boolean {
  const value = readInput(environment, name).toLowerCase();
  if (value === "") {
    return defaultValue;
  }
  if (value !== "true" && value !== "false") {
    throw new RangeError(`The input ${name} must be "true" or "false", not "${value}".`);
  }
  return value === "true";
}

/** Reads every input of the action and checks them. */
export function readActionInputs(environment: NodeJS.ProcessEnv): ActionInputs {
  const target = readInput(environment, "target") || (environment.GITHUB_REPOSITORY_OWNER ?? "");
  if (target === "") {
    throw new RangeError("The input target is empty and GITHUB_REPOSITORY_OWNER is not set.");
  }
  const maxBranches = Number(readInput(environment, "max-branches") || "20");
  if (!Number.isInteger(maxBranches) || maxBranches < 1) {
    throw new RangeError("The input max-branches needs a whole number of at least 1.");
  }
  const token = readInput(environment, "token") || undefined;
  const failOnFindings = readSwitch(environment, "fail-on-findings", true);
  const sarif = readSwitch(environment, "sarif", false);
  return { target, maxBranches, failOnFindings, sarif, token };
}

/** Writes the outputs, the run summary and, when asked, the SARIF file of a finished scan. */
function publishResult(result: ScanResult, inputs: ActionInputs, environment: NodeJS.ProcessEnv, runner: ActionRunner): void {
  const outputFile = environment.GITHUB_OUTPUT;
  const summaryFile = environment.GITHUB_STEP_SUMMARY;
  if (outputFile !== undefined) {
    runner.appendFile(outputFile, `findings=${result.findings.length}\nrepositories=${result.scannedRepositories}\n`);
  }
  if (summaryFile !== undefined) {
    runner.appendFile(summaryFile, formatMarkdown(result.findings, result.scannedRepositories));
  }
  if (inputs.sarif) {
    runner.writeFile(SARIF_FILE, formatSarif(result.findings, VERSION));
  }
}

/** Runs the action and returns its exit code: 1 when worms are found and fail-on-findings is on, or when the scan fails. */
export async function runAction(environment: NodeJS.ProcessEnv, runner: ActionRunner): Promise<number> {
  try {
    const inputs = readActionInputs(environment);
    const options: ScanOptions = { maxBranches: inputs.maxBranches };
    if (inputs.token !== undefined) {
      options.token = inputs.token;
    }
    const result = await runner.scan(inputs.target, options);
    runner.log(formatText(result.findings, result.scannedRepositories));
    publishResult(result, inputs, environment, runner);
    const wormSigns = result.findings.filter(isWormSign);
    const mustFail = inputs.failOnFindings && wormSigns.length > 0;
    if (mustFail) {
      runner.log(`::error title=wormsign::${wormSigns.length} sign(s) of an agent worm found in ${inputs.target}.`);
      return 1;
    }
    return 0;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    runner.log(`::error title=wormsign::${reason}`);
    return 1;
  }
}

/** Writes a line to the log of the run. */
function writeLog(text: string): void {
  process.stdout.write(`${text}\n`);
}

/** The runner used on GitHub Actions, with the real files and the real scan. */
export const REAL_RUNNER: ActionRunner = { appendFile: appendFileSync, writeFile: writeFileSync, log: writeLog, scan };
