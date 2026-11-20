import type { Finding } from "./types.js";
/** The address of the documentation of the rules. */
export declare const RULES_URL = "https://github.com/nukoe-labs/wormsign#rules";
/** The address of the full guide for victims. */
export declare const GUIDE_URL = "https://github.com/nukoe-labs/wormsign/blob/main/docs/if-you-are-hit.md";
/** The steps to follow, in this order, when a worm finding is confirmed. */
export declare const RESPONSE_STEPS: string[];
/** Tells whether a finding is a sign of a worm (critical or high), and not a note for a human to review. */
export declare function isWormSign(finding: Finding): boolean;
/** Counts the repositories that carry at least one worm sign. */
export declare function countAffectedRepositories(findings: Finding[]): number;
/** Writes the one-line summary of a scan, such as "3 of 40 repositories show worm signs". */
export declare function formatSummary(findings: Finding[], scannedRepositories: number): string;
/** Writes the full text report: findings first, then the summary, so that it stays visible at the bottom of a terminal, then the response steps. */
export declare function formatText(findings: Finding[], scannedRepositories: number, useColor?: boolean): string;
/** Writes the findings as indented JSON. */
export declare function formatJson(findings: Finding[]): string;
/** Writes the findings in SARIF 2.1.0, the format of the GitHub Security tab. */
export declare function formatSarif(findings: Finding[], version: string): string;
/** Writes the Markdown report shown in the summary of a GitHub Actions run. */
export declare function formatMarkdown(findings: Finding[], scannedRepositories: number): string;
