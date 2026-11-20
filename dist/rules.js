import { COMMIT_MARKERS, DROP_DESCRIPTIONS, INSTRUCTION_MARKERS, PAYLOAD_COMMANDS, INJECTION_PHRASES, PAYLOAD_FOLDER, SESSION_START_EVENTS, SETUP_SCRIPT } from "./signatures.js";
/** Every rule of wormsign, with its stable identifier. */
export const RULES = {
    agentHook: { id: "WS001", severity: "high", title: "Agent hook starts a worm payload as soon as a session starts" },
    folderOpenTask: { id: "WS002", severity: "high", title: "Editor task starts a worm payload when the folder is opened" },
    mcpServer: { id: "WS003", severity: "medium", title: "Repository declares a local MCP server command" },
    largeScript: { id: "WS004", severity: "high", title: "Large script next to the agent configuration" },
    invisibleUnicode: { id: "WS005", severity: "high", title: "Invisible characters in an agent instruction file" },
    agentInjection: { id: "WS006", severity: "medium", title: "Instruction file tells the agent to skip checks" },
    wormMarker: { id: "WS007", severity: "critical", title: "Commit message carries a known worm marker" },
    dropRepository: { id: "WS008", severity: "critical", title: "Repository looks like a worm exfiltration drop" },
    backdatedCommit: { id: "WS009", severity: "medium", title: "Head commit is dated long before the last push" },
    toolHook: { id: "WS010", severity: "medium", title: "Agent hook runs a command" },
    instructionMarker: { id: "WS011", severity: "critical", title: "Instruction file carries a known worm marker" },
    folderOpenCommand: { id: "WS012", severity: "medium", title: "Editor task runs a command when the folder is opened" },
};
/** The smallest size, in bytes, of a script considered as a hidden payload. */
export const LARGE_SCRIPT_BYTES = 500_000;
/** The number of days between a commit date and the last push above which the commit is called backdated. */
export const BACKDATED_DAYS = 30;
const MILLISECONDS_PER_DAY = 86_400_000;
const SCRIPT_EXTENSION = /\.(?:c|m)?js$/u;
const INVISIBLE_CHARACTERS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]|[\u{E0000}-\u{E007F}]/u;
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
/** The file where Codex CLI reads MCP servers, written in TOML rather than JSON. */
export const MCP_TOML_FILES = new Set([".codex/config.toml"]);
/** The file where VS Code and its forks read tasks. */
export const TASKS_FILE = ".vscode/tasks.json";
/** Tells whether a path is an instruction file, at the root or as a Cursor rule. */
export function isInstructionFile(path) {
    const isCursorRule = path.startsWith(".cursor/rules/");
    return INSTRUCTION_FILES.has(path) || isCursorRule;
}
/** Reads a JSON text and returns its value, or undefined when the text is not valid JSON. */
export function parseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}
/** Tells whether a value is a plain object that can be read by key. */
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Collects every "command" string found anywhere inside a JSON value. */
export function collectCommands(value) {
    if (typeof value === "string" || value === null || typeof value !== "object") {
        return [];
    }
    const commands = [];
    for (const [key, child] of Object.entries(value)) {
        if (key === "command" && typeof child === "string") {
            commands.push(child);
            continue;
        }
        commands.push(...collectCommands(child));
    }
    return commands;
}
/** Returns the commands that agent hooks would run, from the text of a settings file, split by the moment they run. */
export function findHookCommands(settingsText) {
    const hookCommands = { sessionStart: [], otherEvents: [] };
    const settings = parseJson(settingsText);
    if (!isRecord(settings) || !isRecord(settings.hooks)) {
        return hookCommands;
    }
    for (const [event, eventHooks] of Object.entries(settings.hooks)) {
        const commands = collectCommands(eventHooks);
        const list = SESSION_START_EVENTS.has(event) ? hookCommands.sessionStart : hookCommands.otherEvents;
        list.push(...commands);
    }
    return hookCommands;
}
/** Tells whether one VS Code task runs when the folder is opened. */
function runsOnFolderOpen(task) {
    if (!isRecord(task) || !isRecord(task.runOptions)) {
        return false;
    }
    return task.runOptions.runOn === "folderOpen";
}
/** Returns the labels of the VS Code tasks that run when the folder is opened. */
export function findFolderOpenTasks(tasksText) {
    const tasks = parseJson(tasksText);
    if (!isRecord(tasks) || !Array.isArray(tasks.tasks)) {
        return [];
    }
    const autoRunTasks = tasks.tasks.filter(runsOnFolderOpen);
    return autoRunTasks.map(describeTask);
}
/** Returns a short readable name for a VS Code task. */
function describeTask(task) {
    const label = typeof task.label === "string" ? task.label : "unnamed task";
    const command = typeof task.command === "string" ? task.command : "";
    return `${label}: ${command}`.trim();
}
/** Returns the commands of the local MCP servers declared in a configuration file. */
export function findMcpCommands(configText) {
    const config = parseJson(configText);
    if (!isRecord(config)) {
        return [];
    }
    const servers = config.mcpServers ?? config.servers;
    return collectCommands(servers);
}
/** The shape of a TOML table header, such as [mcp_servers.local]. */
const TOML_TABLE = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/u;
/** The shape of a TOML assignment whose value is written on the same line. */
const TOML_COMMAND = /^\s*command\s*=\s*(.*)$/u;
/** The shape of a Codex table that declares one MCP server, quoted name included. */
const MCP_SERVER_TABLE = /^mcp_servers\.(?:[A-Za-z0-9_-]+|"[^"]*"|'[^']*')$/u;
/** Returns the name inside a TOML table header, or undefined for any other line. */
function readTableHeader(line) {
    return TOML_TABLE.exec(line)?.[1]?.trim();
}
/** Tells whether a table header declares one MCP server: [mcp_servers.local], not [mcp_servers.local.env]. */
function isMcpServerTable(header) {
    return MCP_SERVER_TABLE.test(header);
}
/** Reads a one-line TOML string, undoing \" and \\ inside a basic string, or returns undefined when the value is not one. */
function readTomlString(value) {
    const delimiter = value.charAt(0);
    const isBasicString = delimiter === "\"";
    if (!isBasicString && delimiter !== "'") {
        return undefined;
    }
    let result = "";
    let index = 1;
    while (index < value.length) {
        const character = value.charAt(index);
        if (isBasicString && character === "\\") {
            const escaped = value.charAt(index + 1);
            result += escaped === "\\" || escaped === "\"" ? escaped : `\\${escaped}`;
            index += 2;
            continue;
        }
        if (character === delimiter) {
            return result;
        }
        result += character;
        index += 1;
    }
    return undefined;
}
/** Returns the command of an MCP server table line, or undefined when the line holds no non-empty command string. */
function readTomlCommand(line) {
    const value = TOML_COMMAND.exec(line)?.[1];
    if (value === undefined) {
        return undefined;
    }
    const command = readTomlString(value.trim());
    return command === "" ? undefined : command;
}
/**
 * Returns the commands of the local MCP servers declared in a Codex TOML file.
 * Only `command` keys written directly in a `[mcp_servers.<name>]` table count, so the
 * same key inside a sub-table such as `[mcp_servers.<name>.env]` is not mistaken for one.
 * A line that opens a table without closing it ends the current table, so a command below a
 * broken header is not credited to the server above it.
 * Inline tables (`name = { command = "..." }`) are not read: no worm sample uses them.
 */
export function findMcpTomlCommands(text) {
    const commands = [];
    let inServerTable = false;
    for (const line of text.split(/\r?\n/u)) {
        const header = readTableHeader(line);
        if (header !== undefined) {
            inServerTable = isMcpServerTable(header);
            continue;
        }
        if (line.trimStart().startsWith("[")) {
            inServerTable = false;
            continue;
        }
        const command = inServerTable ? readTomlCommand(line) : undefined;
        if (command !== undefined) {
            commands.push(command);
        }
    }
    return commands;
}
/** Tells whether a text contains invisible or text-direction characters. */
export function hasInvisibleCharacters(text) {
    return INVISIBLE_CHARACTERS.test(text);
}
/** Returns the phrases of a text that tell an agent to skip confirmation or hide what it does. */
export function findInjectionPhrases(text) {
    const phrases = [];
    for (const pattern of INJECTION_PHRASES) {
        const match = pattern.exec(text);
        if (match !== null) {
            phrases.push(match[0]);
        }
    }
    return phrases;
}
/** Tells whether a tree entry is a large script stored where agent payloads hide. */
export function isLargeScript(entry) {
    const isScript = entry.type === "blob" && (SCRIPT_EXTENSION.test(entry.path) || SETUP_SCRIPT.test(entry.path));
    const isInPayloadPlace = PAYLOAD_FOLDER.test(entry.path) || SETUP_SCRIPT.test(entry.path);
    const isLarge = (entry.size ?? 0) >= LARGE_SCRIPT_BYTES;
    return isScript && isInPayloadPlace && isLarge;
}
/** Tells whether a command starts a worm payload: a setup or init script, or a downloaded script piped into a shell. */
export function isPayloadCommand(command) {
    return PAYLOAD_COMMANDS.some(matchesMessage, command);
}
/** Tells whether an instruction file carries a marker written by a known worm. */
export function hasInstructionMarker(text) {
    return INSTRUCTION_MARKERS.some(matchesMessage, text);
}
/** Tells whether a commit message carries a marker written by a known worm. */
export function hasWormMarker(message) {
    return COMMIT_MARKERS.some(matchesMessage, message);
}
/** Tells whether one marker pattern matches the message given as this. */
function matchesMessage(marker) {
    return marker.value.test(this);
}
/** Tells whether a repository has the description, and when needed the name shape, of a worm exfiltration repository. */
export function isDropDescription(description, name = "") {
    if (description === null) {
        return false;
    }
    const repository = { description: description.trim(), name };
    return DROP_DESCRIPTIONS.some(matchesDrop, repository);
}
/** Tells whether a drop signature matches the repository given as this. */
function matchesDrop(signature) {
    const nameMatches = signature.namePattern === undefined || signature.namePattern.test(this.name);
    return signature.value === this.description && nameMatches;
}
/** Returns how many whole days a commit date is older than the last push, or 0 when it is not older. */
export function daysBeforePush(commitDate, pushedAt) {
    const gap = Date.parse(pushedAt) - Date.parse(commitDate);
    if (!Number.isFinite(gap) || gap <= 0) {
        return 0;
    }
    return Math.floor(gap / MILLISECONDS_PER_DAY);
}
