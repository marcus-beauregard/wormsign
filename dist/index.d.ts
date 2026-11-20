import type { Finding, ScanOptions } from "./types.js";
export { GitHubError } from "./github.js";
export { RULES } from "./rules.js";
export { countAffectedRepositories, formatJson, formatMarkdown, formatSarif, formatSummary, formatText, isWormSign, RESPONSE_STEPS } from "./report.js";
export type { Finding, ScanOptions, Severity } from "./types.js";
/** The result of a scan: the findings and how many repositories were read. */
export interface ScanResult {
    findings: Finding[];
    scannedRepositories: number;
}
/** Checks that a target is a GitHub owner or an owner/name repository, and returns it trimmed. */
export declare function checkTarget(target: string): string;
/** Scans one repository (owner/name) or every active repository of a user or an organization, through the API only. */
export declare function scan(target: string, options?: ScanOptions): Promise<ScanResult>;
