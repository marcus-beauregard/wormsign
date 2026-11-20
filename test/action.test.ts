import { afterEach, describe, expect, it, vi } from "vitest";
import { readActionInputs, REAL_RUNNER, runAction, SARIF_FILE } from "../src/action.js";
import type { ActionRunner } from "../src/action.js";
import type { ScanResult } from "../src/index.js";
import { formatMarkdown, formatText } from "../src/report.js";
import type { Finding } from "../src/types.js";
import { createFakeFetch } from "./fake-github.js";

const HOOK: Finding = { rule: "WS001", severity: "high", repository: "o/a", branch: "main", path: ".claude/settings.json", message: "Runs | node x" };
const NOTE: Finding = { rule: "WS003", severity: "medium", repository: "o/b", message: "MCP server." };

/** A runner that records files and logs, and returns a fixed scan result. */
interface RecordedRunner extends ActionRunner {
  files: Record<string, string>;
  logs: string[];
  options: unknown[];
}

/** Builds a runner that answers with the given result, or fails with the given value. */
function createRunner(result: ScanResult | { failure: unknown }): RecordedRunner {
  const files: Record<string, string> = {};
  const logs: string[] = [];
  const options: unknown[] = [];
  /** Adds a text at the end of a recorded file. */
  function appendFile(path: string, text: string): void {
    files[path] = (files[path] ?? "") + text;
  }
  /** Replaces a recorded file. */
  function writeFile(path: string, text: string): void {
    files[path] = text;
  }
  /** Keeps a log line. */
  function log(text: string): void {
    logs.push(text);
  }
  /** Returns the fixed result or throws the failure. */
  async function fakeScan(_target: string, scanOptions: unknown): Promise<ScanResult> {
    options.push(scanOptions);
    if ("failure" in result) {
      throw result.failure;
    }
    return result;
  }
  return { files, logs, options, appendFile, writeFile, log, scan: fakeScan };
}

const ENVIRONMENT = { INPUT_TARGET: "o", GITHUB_OUTPUT: "out", GITHUB_STEP_SUMMARY: "summary" };

/** Checks the default values and the checks of the inputs. */
function readsTheInputs(): void {
  expect(readActionInputs({ GITHUB_REPOSITORY_OWNER: "owner" })).toEqual({ target: "owner", maxBranches: 20, failOnFindings: true, sarif: false, token: undefined });
  const custom = { INPUT_TARGET: " o/r ", "INPUT_MAX-BRANCHES": "3", "INPUT_FAIL-ON-FINDINGS": "FALSE", INPUT_SARIF: "true", INPUT_TOKEN: "t" };
  expect(readActionInputs(custom)).toEqual({ target: "o/r", maxBranches: 3, failOnFindings: false, sarif: true, token: "t" });
  expect(readActionInputs.bind(undefined, {})).toThrow("The input target is empty");
  expect(readActionInputs.bind(undefined, { INPUT_TARGET: "o", "INPUT_MAX-BRANCHES": "0" })).toThrow("max-branches");
  expect(readActionInputs.bind(undefined, { INPUT_TARGET: "o", INPUT_SARIF: "yes" })).toThrow('The input sarif must be "true" or "false"');
}

/** Checks that worm signs fail the job and fill the outputs, the summary and the SARIF file. */
async function failsAndReportsWormSigns(): Promise<void> {
  const runner = createRunner({ findings: [HOOK, NOTE], scannedRepositories: 4 });
  expect(await runAction({ ...ENVIRONMENT, INPUT_SARIF: "true", INPUT_TOKEN: "t" }, runner)).toBe(1);
  expect(runner.files.out).toBe("findings=2\nrepositories=4\n");
  expect(runner.files.summary).toContain("## wormsign: 1 of 4 repositories show worm signs (2 finding(s), 1 note(s) to review).");
  expect(runner.files.summary).toContain("Runs \\| node x");
  expect(JSON.parse(runner.files[SARIF_FILE] ?? "").version).toBe("2.1.0");
  expect(runner.logs.at(-1)).toBe("::error title=wormsign::1 sign(s) of an agent worm found in o.");
  expect(runner.options).toEqual([{ maxBranches: 20, token: "t" }]);
}

/** Checks that notes alone, or fail-on-findings set to false, keep the job green. */
async function staysGreenWhenAllowed(): Promise<void> {
  expect(await runAction(ENVIRONMENT, createRunner({ findings: [NOTE], scannedRepositories: 1 }))).toBe(0);
  const runner = createRunner({ findings: [HOOK], scannedRepositories: 1 });
  expect(await runAction({ INPUT_TARGET: "o", "INPUT_FAIL-ON-FINDINGS": "false" }, runner)).toBe(0);
  expect(runner.files).toEqual({});
}

/** Checks that a scan that cannot run fails the job with its reason. */
async function failsWhenTheScanCannotRun(): Promise<void> {
  const runner = createRunner({ failure: new Error("GitHub answered 404 for /users/o/repos.") });
  expect(await runAction(ENVIRONMENT, runner)).toBe(1);
  expect(runner.logs).toEqual(["::error title=wormsign::GitHub answered 404 for /users/o/repos."]);
  const textRunner = createRunner({ failure: "offline" });
  expect(await runAction(ENVIRONMENT, textRunner)).toBe(1);
  expect(textRunner.logs).toEqual(["::error title=wormsign::offline"]);
}

/** Checks the Markdown and text reports, with and without colors. */
function writesTheReports(): void {
  expect(formatMarkdown([], 2)).toBe("## wormsign: 0 of 2 repositories show worm signs (0 finding(s)).\n\nNo sign of an agent worm was found.\n");
  expect(formatMarkdown([HOOK], 1)).toContain("1. Do not revoke the stolen token first");
  expect(formatText([NOTE], 1)).toContain("These notes are not worm signs");
  expect(formatText([HOOK], 1, true)).toContain("\u001B[31m[HIGH]\u001B[0m");
  expect(formatText([], 1, true)).toContain("\u001B[32mNo sign of an agent worm was found.\u001B[0m");
  expect(formatText([HOOK], 1)).toContain("Full guide: https://github.com/nukoe-labs/wormsign/blob/main/docs/if-you-are-hit.md");
}

/** Checks that the entry point runs the real action and sets the exit code. */
async function startsFromTheEntryPoint(): Promise<void> {
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  vi.stubGlobal("fetch", createFakeFetch({ "/users/o/repos?per_page=100&page=1&type=owner": { body: [] } }));
  vi.stubEnv("INPUT_TARGET", "o");
  vi.stubEnv("GITHUB_OUTPUT", "");
  vi.stubEnv("GITHUB_STEP_SUMMARY", "");
  delete process.env.GITHUB_OUTPUT;
  delete process.env.GITHUB_STEP_SUMMARY;
  await import("../src/action-main.js");
  expect(process.exitCode).toBe(0);
  expect(REAL_RUNNER.scan).toBeTypeOf("function");
  process.exitCode = undefined;
}

/** Restores what the tests replaced. */
function restore(): void {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
}

/** Groups the tests of the GitHub Action. */
function describeAction(): void {
  afterEach(restore);
  it("reads the inputs", readsTheInputs);
  it("fails and reports worm signs", failsAndReportsWormSigns);
  it("stays green when allowed", staysGreenWhenAllowed);
  it("fails when the scan cannot run", failsWhenTheScanCannotRun);
  it("writes the reports", writesTheReports);
  it("starts from the entry point", startsFromTheEntryPoint);
}

describe("GitHub Action", describeAction);
