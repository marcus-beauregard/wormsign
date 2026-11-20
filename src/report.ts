import { RULES } from "./rules.js";
import type { Finding, Severity } from "./types.js";

/** The address of the documentation of the rules. */
export const RULES_URL = "https://github.com/nukoe-labs/wormsign#rules";

const SARIF_LEVELS: Record<Severity, string> = { critical: "error", high: "error", medium: "warning" };

/** The steps to follow, in this order, when a worm finding is confirmed. */
export const RESPONSE_STEPS = [
  "Do not revoke the stolen token first: some worms (Miasma) wipe your home folder when their token stops working.",
  "Disconnect the infected computer from the network and back up your files.",
  "Look for ~/.config/index.js, ~/.local/share/runtimes/sync.py, ~/.config/net-health-checker/ and services named pkg-runtime or net-health-checker; reinstall if one exists.",
  "From a clean computer, revoke GitHub tokens, SSH keys and sessions, then npm, PyPI, cloud and AI API keys.",
  "Remove the files listed above with a normal commit, then check your GitHub security log for pushes you did not make.",
];

/** Writes the place of a finding as repository, branch and path. */
function formatPlace(finding: Finding): string {
  const branch = finding.branch === undefined ? "" : `@${finding.branch}`;
  const path = finding.path === undefined ? "" : `:${finding.path}`;
  return `${finding.repository}${branch}${path}`;
}

/** Writes one finding on two lines for a terminal. */
function formatFinding(finding: Finding): string {
  return `[${finding.severity.toUpperCase()}] ${finding.rule} ${formatPlace(finding)}\n  ${finding.message}`;
}

/** Writes the full text report: findings first, then the response steps when something was found. */
export function formatText(findings: Finding[], scannedRepositories: number): string {
  const summary = `wormsign: ${findings.length} finding(s) in ${scannedRepositories} repository(ies).`;
  if (findings.length === 0) {
    return `${summary}\nNo sign of an agent worm was found.`;
  }
  const lines = findings.map(formatFinding);
  const numberedSteps = RESPONSE_STEPS.map(numberStep);
  return [summary, "", ...lines, "", "What to do, in this order:", ...numberedSteps].join("\n");
}

/** Writes one response step with its number. */
function numberStep(step: string, index: number): string {
  return `  ${index + 1}. ${step}`;
}

/** Writes the findings as indented JSON. */
export function formatJson(findings: Finding[]): string {
  return JSON.stringify({ findings }, null, 2);
}

/** Builds the SARIF description of one rule. */
function describeRule(rule: { id: string; title: string }): Record<string, unknown> {
  return { id: rule.id, name: rule.id, shortDescription: { text: rule.title }, helpUri: RULES_URL };
}

/** Builds the SARIF result of one finding. */
function describeResult(finding: Finding): Record<string, unknown> {
  const location = { physicalLocation: { artifactLocation: { uri: finding.path ?? finding.repository } } };
  return {
    ruleId: finding.rule,
    level: SARIF_LEVELS[finding.severity],
    message: { text: `${formatPlace(finding)}: ${finding.message}` },
    locations: [location],
  };
}

/** Writes the findings in SARIF 2.1.0, the format of the GitHub Security tab. */
export function formatSarif(findings: Finding[], version: string): string {
  const rules = Object.values(RULES).map(describeRule);
  const driver = { name: "wormsign", version, informationUri: RULES_URL, rules };
  const run = { tool: { driver }, results: findings.map(describeResult) };
  const sarif = { $schema: "https://json.schemastore.org/sarif-2.1.0.json", version: "2.1.0", runs: [run] };
  return JSON.stringify(sarif, null, 2);
}
