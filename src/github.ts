import type { BranchInfo, CommitInfo, FetchFunction, RepositoryInfo, ScanOptions, TreeEntry } from "./types.js";

const DEFAULT_API_URL = "https://api.github.com";
const PAGE_SIZE = 100;
const NOT_FOUND_STATUS = 404;
const LIMIT_STATUSES = new Set([403, 429]);
const LIMIT_HINT = " The rate limit may be reached: set GITHUB_TOKEN, for example GITHUB_TOKEN=$(gh auth token).";

/** The error thrown when the GitHub API refuses a request or cannot be reached. */
export class GitHubError extends Error {
  readonly status: number | undefined;

  /** Builds the error with its message and, when GitHub answered, its HTTP status. */
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

/** A small read-only client for the GitHub REST API. */
export interface GitHubClient {
  getJson: <T>(path: string) => Promise<T>;
}

/** Builds the headers sent with every request, with the token when one is given. */
function buildHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "wormsign",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token !== undefined && token !== "") {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** Sends one GET request and returns the response, or throws a GitHubError when the network fails. */
async function sendRequest(fetchFunction: FetchFunction, url: string, headers: Record<string, string>): Promise<Response> {
  try {
    return await fetchFunction(url, { headers });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new GitHubError(`GitHub cannot be reached: ${reason}`);
  }
}

/** Creates a client that reads the GitHub REST API with the given options. */
export function createGitHubClient(options: ScanOptions): GitHubClient {
  const fetchFunction = options.fetch ?? globalThis.fetch;
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  const headers = buildHeaders(options.token);

  /** Reads one API path and returns its JSON body, or throws a GitHubError with the HTTP status. */
  async function getJson<T>(path: string): Promise<T> {
    const response = await sendRequest(fetchFunction, `${apiUrl}${path}`, headers);
    if (!response.ok) {
      const hint = LIMIT_STATUSES.has(response.status) ? LIMIT_HINT : "";
      throw new GitHubError(`GitHub answered ${response.status} for ${path}.${hint}`, response.status);
    }
    return (await response.json()) as T;
  }

  return { getJson };
}

/** Lists every public repository of a user or an organization, page by page. */
export async function listRepositories(client: GitHubClient, owner: string): Promise<RepositoryInfo[]> {
  const repositories: RepositoryInfo[] = [];
  let page = 1;
  let pageIsFull = true;
  while (pageIsFull) {
    const path = `/users/${encodeURIComponent(owner)}/repos?per_page=${PAGE_SIZE}&page=${page}&type=owner`;
    const pageOfRepositories = await client.getJson<RepositoryInfo[]>(path);
    repositories.push(...pageOfRepositories);
    pageIsFull = pageOfRepositories.length === PAGE_SIZE;
    page += 1;
  }
  return repositories;
}

/** Reads one repository written owner/name. */
export async function getRepository(client: GitHubClient, fullName: string): Promise<RepositoryInfo> {
  return client.getJson<RepositoryInfo>(`/repos/${fullName}`);
}

/** Lists the branches of a repository, at most the given number. */
export async function listBranches(client: GitHubClient, fullName: string, maxBranches: number): Promise<BranchInfo[]> {
  const pageSize = Math.min(maxBranches, PAGE_SIZE);
  const branches = await client.getJson<BranchInfo[]>(`/repos/${fullName}/branches?per_page=${pageSize}`);
  return branches.slice(0, maxBranches);
}

/** Reads the full file tree of a commit, without downloading any file. */
export async function getTree(client: GitHubClient, fullName: string, sha: string): Promise<TreeEntry[]> {
  const tree = await client.getJson<{ tree: TreeEntry[] }>(`/repos/${fullName}/git/trees/${sha}?recursive=1`);
  return tree.tree;
}

/** Reads a small text file at a commit and returns its text, or undefined when the file is missing. */
export async function getFileText(client: GitHubClient, fullName: string, path: string, sha: string): Promise<string | undefined> {
  try {
    const file = await client.getJson<{ content: string }>(`/repos/${fullName}/contents/${encodeURI(path)}?ref=${sha}`);
    return Buffer.from(file.content, "base64").toString("utf8");
  } catch (error) {
    const fileIsMissing = error instanceof GitHubError && error.status === NOT_FOUND_STATUS;
    if (fileIsMissing) {
      return undefined;
    }
    throw error;
  }
}

/** Reads one commit of a repository. */
export async function getCommit(client: GitHubClient, fullName: string, sha: string): Promise<CommitInfo> {
  return client.getJson<CommitInfo>(`/repos/${fullName}/commits/${sha}`);
}
