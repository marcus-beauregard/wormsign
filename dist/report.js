import { RULES } from "./rules.js";
/** The address of the documentation of the rules. */
export const RULES_URL = "https://github.com/nukoe-labs/wormsign#rules";
/** The address of the full guide for victims. */
export const GUIDE_URL = "https://github.com/nukoe-labs/wormsign/blob/main/docs/if-you-are-hit.md";
const SARIF_LEVELS = { critical: "error", high: "error", medium: "warning" };
/** The steps to follow, in this order, when a worm finding is confirmed. */
export const RESPONSE_STEPS = [
    "Do not revoke the stolen token first: some worms (Miasma) wipe your home folder when their token stops working.",
    "Disconnect the infected computer from the network and back up your files.",
    "Look for ~/.config/index.js, ~/.local/share/runtimes/sync.py, ~/.config/net-health-checker/ and services named pkg-runtime or net-health-checker; reinstall if one exists.",
    "From a clean computer, revoke GitHub tokens, SSH keys and sessions, then npm, PyPI, cloud and AI API keys.",
    "Remove the files listed above with a normal commit, then check your GitHub security log for pushes you did not make.",
];
/** Writes the place of a finding as repository, branch and path. */
function formatPlace(finding) {
    const branch = finding.branch === undefined ? "" : `@${finding.branch}`;
    const path = finding.path === undefined ? "" : `:${finding.path}`;
    return `${finding.repository}${branch}${path}`;
}
/** The terminal colors of each severity, as ANSI escape codes. */
const SEVERITY_COLORS = { critical: "\u001B[1;31m", high: "\u001B[31m", medium: "\u001B[33m" };
const BOLD = "\u001B[1m";
const GREEN = "\u001B[32m";
const RESET = "\u001B[0m";
/** Wraps a text in a terminal color when colors are on. */
function paint(text, color, useColor) {
    if (!useColor) {
        return text;
    }
    return `${color}${text}${RESET}`;
}
/** Tells whether a finding is a sign of a worm (critical or high), and not a note for a human to review. */
export function isWormSign(finding) {
    return finding.severity !== "medium";
}
/** Counts the repositories that carry at least one worm sign. */
export function countAffectedRepositories(findings) {
    const wormSigns = findings.filter(isWormSign);
    const repositories = new Set(wormSigns.map(readRepository));
    return repositories.size;
}
/** Returns the repository of a finding. */
function readRepository(finding) {
    return finding.repository;
}
/** Writes the one-line summary of a scan, such as "3 of 40 repositories show worm signs". */
export function formatSummary(findings, scannedRepositories) {
    const affected = countAffectedRepositories(findings);
    const notes = findings.length - findings.filter(isWormSign).length;
    const notesText = notes === 0 ? "" : `, ${notes} note(s) to review`;
    return `wormsign: ${affected} of ${scannedRepositories} repositories show worm signs (${findings.length} finding(s)${notesText}).`;
}
/** Writes one finding on two lines for a terminal. */
function formatFinding(finding) {
    const label = paint(`[${finding.severity.toUpperCase()}]`, SEVERITY_COLORS[finding.severity], this);
    return `${label} ${finding.rule} ${formatPlace(finding)}\n  ${finding.message}`;
}
/** Writes the full text report: findings first, then the summary, so that it stays visible at the bottom of a terminal, then the response steps. */
export function formatText(findings, scannedRepositories, useColor = false) {
    const summary = paint(formatSummary(findings, scannedRepositories), BOLD, useColor);
    if (findings.length === 0) {
        return `${summary}\n${paint("No sign of an agent worm was found.", GREEN, useColor)}`;
    }
    const lines = findings.map(formatFinding, useColor);
    if (countAffectedRepositories(findings) === 0) {
        return [...lines, "", summary, "These notes are not worm signs: read the files to confirm they are yours."].join("\n");
    }
    const numberedSteps = RESPONSE_STEPS.map(numberStep);
    const guide = `Full guide: ${GUIDE_URL}`;
    return [...lines, "", summary, "", paint("What to do, in this order:", BOLD, useColor), ...numberedSteps, guide].join("\n");
}
/** Writes one response step with its number. */
function numberStep(step, index) {
    return `  ${index + 1}. ${step}`;
}
/** Writes the findings as indented JSON. */
export function formatJson(findings) {
    return JSON.stringify({ findings }, null, 2);
}
/** Builds the SARIF description of one rule. */
function describeRule(rule) {
    return { id: rule.id, name: rule.id, shortDescription: { text: rule.title }, helpUri: RULES_URL };
}
/** Builds the SARIF result of one finding. */
function describeResult(finding) {
    const location = { physicalLocation: { artifactLocation: { uri: finding.path ?? finding.repository } } };
    return {
        ruleId: finding.rule,
        level: SARIF_LEVELS[finding.severity],
        message: { text: `${formatPlace(finding)}: ${finding.message}` },
        locations: [location],
    };
}
/** Writes the findings in SARIF 2.1.0, the format of the GitHub Security tab. */
export function formatSarif(findings, version) {
    const rules = Object.values(RULES).map(describeRule);
    const driver = { name: "wormsign", version, informationUri: RULES_URL, rules };
    const run = { tool: { driver }, results: findings.map(describeResult) };
    const sarif = { $schema: "https://json.schemastore.org/sarif-2.1.0.json", version: "2.1.0", runs: [run] };
    return JSON.stringify(sarif, null, 2);
}
/** Protects the characters that would break a Markdown table cell. */
function escapeTableCell(text) {
    return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}
/** Writes one finding as a row of the Markdown table. */
function formatMarkdownRow(finding) {
    const place = escapeTableCell(formatPlace(finding));
    const message = escapeTableCell(finding.message);
    return `| ${finding.severity} | ${finding.rule} | \`${place}\` | ${message} |`;
}
/** Writes the Markdown report shown in the summary of a GitHub Actions run. */
export function formatMarkdown(findings, scannedRepositories) {
    const title = `## ${formatSummary(findings, scannedRepositories)}`;
    if (findings.length === 0) {
        return `${title}\n\nNo sign of an agent worm was found.\n`;
    }
    const header = ["| Severity | Rule | Place | What was found |", "|---|---|---|---|"];
    const rows = findings.map(formatMarkdownRow);
    const numberedSteps = RESPONSE_STEPS.map(numberMarkdownStep);
    return [title, "", ...header, ...rows, "", "### What to do, in this order", "", ...numberedSteps, ""].join("\n");
}
/** Writes one response step as an item of a Markdown numbered list. */
function numberMarkdownStep(step, index) {
    return `${index + 1}. ${step}`;
}
