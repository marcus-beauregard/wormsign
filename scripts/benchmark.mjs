// This script measures false positives: it scans the most recently pushed repositories of well-known healthy
// organizations and writes docs/benchmark.json. Usage: GITHUB_TOKEN=$(gh auth token) node scripts/benchmark.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { isWormSign, scan } from "../dist/index.js";

const ORGANIZATIONS_FILE = new URL("./healthy-organizations.txt", import.meta.url);
const RESULT_FILE = new URL("../docs/benchmark.json", import.meta.url);
const REPOSITORIES_PER_ORGANIZATION = 20;
const BRANCHES_PER_REPOSITORY = 3;
const LONGEST_WAIT_SECONDS = 3700;
const TOKEN = process.env.GITHUB_TOKEN ?? "";

/** Reads the list of organizations, one per line, without empty lines and comments. */
function readOrganizations() {
  const lines = readFileSync(ORGANIZATIONS_FILE, "utf8").split("\n");
  return lines.map(trimLine).filter(isOrganizationLine);
}

/** Removes the spaces around a line. */
function trimLine(line) {
  return line.trim();
}

/** Tells whether a line names an organization. */
function isOrganizationLine(line) {
  return line !== "" && !line.startsWith("#");
}

/** Lists the active source repositories of an organization, most recently pushed first. */
async function listRecentRepositories(organization) {
  const answer = await fetch(`https://api.github.com/orgs/${organization}/repos?sort=pushed&per_page=100&type=sources`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json" },
  });
  if (!answer.ok) {
    throw new Error(`GitHub answered ${answer.status} for ${organization}.`);
  }
  const repositories = await answer.json();
  const activeRepositories = repositories.filter(isActiveSource);
  return activeRepositories.slice(0, REPOSITORIES_PER_ORGANIZATION).map(readFullName);
}

/** Tells whether a repository is neither a fork nor archived. */
function isActiveSource(repository) {
  return !repository.fork && !repository.archived;
}

/** Returns the owner/name of a repository. */
function readFullName(repository) {
  return repository.full_name;
}

/** Scans the recent repositories of one organization and returns its worm signs and notes. */
async function scanOrganization(organization) {
  const repositories = await listRecentRepositories(organization);
  const findings = [];
  for (const repository of repositories) {
    const result = await scan(repository, { token: TOKEN, maxBranches: BRANCHES_PER_REPOSITORY, maxWaitSeconds: LONGEST_WAIT_SECONDS });
    findings.push(...result.findings);
  }
  const wormSigns = findings.filter(isWormSign);
  const notes = findings.length - wormSigns.length;
  process.stderr.write(`${organization}: ${repositories.length} repositories, ${wormSigns.length} worm signs, ${notes} notes\n`);
  return { organization, repositories: repositories.length, wormSigns, notes };
}

/** Scans every organization of the list and writes the result file. */
async function runBenchmark() {
  const results = [];
  for (const organization of readOrganizations()) {
    results.push(await scanOrganization(organization));
    const summary = { date: new Date().toISOString(), repositoriesPerOrganization: REPOSITORIES_PER_ORGANIZATION, branchesPerRepository: BRANCHES_PER_REPOSITORY, results };
    writeFileSync(RESULT_FILE, `${JSON.stringify(summary, null, 2)}\n`);
  }
}

await runBenchmark();
