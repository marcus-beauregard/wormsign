import type { Severity, TreeEntry } from "./types.js";

/** The description of one detection rule. */
export interface Rule {
  id: string;
  severity: Severity;
  title: string;
}

/** Every rule of wormsign, with its stable identifier. */
export const RULES = {
  agentHook: { id: "WS001", severity: "high", title: "Agent hook runs a command when the folder is opened" },
  folderOpenTask: { id: "WS002", severity: "high", title: "Editor task runs when the folder is opened" },
  mcpServer: { id: "WS003", severity: "medium", title: "Repository declares a local MCP server command" },
  largeScript: { id: "WS004", severity: "high", title: "Large script next to the agent configuration" },
  invisibleUnicode: { id: "WS005", severity: "high", title: "Invisible characters in an agent instruction file" },
  agentInjection: { id: "WS006", severity: "medium", title: "Instruction file tells the agent to skip checks" },
  wormMarker: { id: "WS007", severity: "critical", title: "Commit message carries a known worm marker" },
  dropRepository: { id: "WS008", severity: "critical", title: "Repository looks like a worm exfiltration drop" },
  backdatedCommit: { id: "WS009", severity: "medium", title: "Head commit is dated long before the last push" },
} as const satisfies Record<string, Rule>;

/** The smallest size, in bytes, of a script considered as a hidden payload. */
export const LARGE_SCRIPT_BYTES = 500_000;

/** The number of days between a commit date and the last push above which the commit is called backdated. */
export const BACKDATED_DAYS = 30;

const MILLISECONDS_PER_DAY = 86_400_000;
const SCRIPT_EXTENSION = /\.(?:c|m)?js$/u;
const PAYLOAD_FOLDER = /^(?:scripts|\.claude|\.github|\.cursor|\.gemini|\.vscode)\//u;
const ROOT_SETUP_FILE = /^setup\.(?:c|m)?js$/u;
const INVISIBLE_CHARACTERS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]|[\u{E0000}-\u{E007F}]/u;
const WORM_MARKERS = [/^AutoSyncComplete:/mu, /^msync-[0-9a-f]{4}\s/mu, /DEVOPS-SEALED/u];
const DROP_DESCRIPTIONS = ["project-utils", "Sha1-Hulud: The Second Coming.", "Shai-Hulud Repository"];
const INJECTION_PHRASES = [
  /without (?:asking|prompting|confirmation|confirming)/iu,
  /do not (?:ask|prompt) (?:for|the user)/iu,
  /(?:hide|suppress|do not show) (?:the )?output/iu,
  /(?:run|execute) [\w./-]*setup[\w.-]* (?:first|before)/iu,
  /never mention (?:this|these)/iu,
];

/** The files that an agent reads as instructions from the repository owner. */
export const INSTRUCTION_FILES = new Set([
  "CLAUDE.md",
  "AGENTS.md",
  "AGENT.md",
  "GEMINI.md",
  ".cursorrules",
  ".windsurfrules",
  ".clinerules",
  ".github/copilot-instructions.md",
]);

/** The files where Claude Code, Gemini CLI and Cursor read hooks. */
export const HOOK_FILES = new Set([".claude/settings.json", ".claude/settings.local.json", ".gemini/settings.json", ".cursor/hooks.json"]);

/** The files where agents and editors read MCP servers. */
export const MCP_FILES = new Set([".mcp.json", ".cursor/mcp.json", ".vscode/mcp.json", ".roo/mcp.json", ".gemini/settings.json"]);

/** The file where VS Code and its forks read tasks. */
export const TASKS_FILE = ".vscode/tasks.json";

/** Tells whether a path is an instruction file, at the root or as a Cursor rule. */
export function isInstructionFile(path: string): boolean {
  const isCursorRule = path.startsWith(".cursor/rules/");
  return INSTRUCTION_FILES.has(path) || isCursorRule;
}

/** Reads a JSON text and returns its value, or undefined when the text is not valid JSON. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Tells whether a value is a plain object that can be read by key. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Collects every "command" string found anywhere inside a JSON value. */
export function collectCommands(value: unknown): string[] {
  if (typeof value === "string" || value === null || typeof value !== "object") {
    return [];
  }
  const commands: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === "command" && typeof child === "string") {
      commands.push(child);
      continue;
    }
    commands.push(...collectCommands(child));
  }
  return commands;
}

/** Returns the commands that Claude Code hooks would run, from the text of a settings file. */
export function findHookCommands(settingsText: string): string[] {
  const settings = parseJson(settingsText);
  if (!isRecord(settings)) {
    return [];
  }
  return collectCommands(settings.hooks);
}

/** Tells whether one VS Code task runs when the folder is opened. */
function runsOnFolderOpen(task: unknown): boolean {
  if (!isRecord(task) || !isRecord(task.runOptions)) {
    return false;
  }
  return task.runOptions.runOn === "folderOpen";
}

/** Returns the labels of the VS Code tasks that run when the folder is opened. */
export function findFolderOpenTasks(tasksText: string): string[] {
  const tasks = parseJson(tasksText);
  if (!isRecord(tasks) || !Array.isArray(tasks.tasks)) {
    return [];
  }
  const autoRunTasks = tasks.tasks.filter(runsOnFolderOpen);
  return autoRunTasks.map(describeTask);
}

/** Returns a short readable name for a VS Code task. */
function describeTask(task: Record<string, unknown>): string {
  const label = typeof task.label === "string" ? task.label : "unnamed task";
  const command = typeof task.command === "string" ? task.command : "";
  return `${label}: ${command}`.trim();
}

/** Returns the commands of the local MCP servers declared in a configuration file. */
export function findMcpCommands(configText: string): string[] {
  const config = parseJson(configText);
  if (!isRecord(config)) {
    return [];
  }
  const servers = config.mcpServers ?? config.servers;
  return collectCommands(servers);
}

/** Tells whether a text contains invisible or text-direction characters. */
export function hasInvisibleCharacters(text: string): boolean {
  return INVISIBLE_CHARACTERS.test(text);
}

/** Returns the phrases of a text that tell an agent to skip confirmation or hide what it does. */
export function findInjectionPhrases(text: string): string[] {
  const phrases: string[] = [];
  for (const pattern of INJECTION_PHRASES) {
    const match = pattern.exec(text);
    if (match !== null) {
      phrases.push(match[0]);
    }
  }
  return phrases;
}

/** Tells whether a tree entry is a large script stored where agent payloads hide. */
export function isLargeScript(entry: TreeEntry): boolean {
  const isScript = entry.type === "blob" && SCRIPT_EXTENSION.test(entry.path);
  const isInPayloadPlace = PAYLOAD_FOLDER.test(entry.path) || ROOT_SETUP_FILE.test(entry.path);
  const isLarge = (entry.size ?? 0) >= LARGE_SCRIPT_BYTES;
  return isScript && isInPayloadPlace && isLarge;
}

/** Tells whether a commit message carries a marker written by a known worm. */
export function hasWormMarker(message: string): boolean {
  return WORM_MARKERS.some(matchesMessage, message);
}

/** Tells whether one marker pattern matches the message given as this. */
function matchesMessage(this: string, pattern: RegExp): boolean {
  return pattern.test(this);
}

/** Tells whether a repository description is one used by worms for their exfiltration repositories. */
export function isDropDescription(description: string | null): boolean {
  return description !== null && DROP_DESCRIPTIONS.includes(description.trim());
}

/** Returns how many whole days a commit date is older than the last push, or 0 when it is not older. */
export function daysBeforePush(commitDate: string, pushedAt: string): number {
  const gap = Date.parse(pushedAt) - Date.parse(commitDate);
  if (!Number.isFinite(gap) || gap <= 0) {
    return 0;
  }
  return Math.floor(gap / MILLISECONDS_PER_DAY);
}
