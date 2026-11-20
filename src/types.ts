/** The level of danger of a finding, from the most to the least urgent. */
export type Severity = "critical" | "high" | "medium";

/** One suspicious element found in a repository. */
export interface Finding {
  /** The stable identifier of the rule, such as WS001. */
  rule: string;
  severity: Severity;
  /** The repository, written owner/name. */
  repository: string;
  /** The branch where the element was seen, when the rule looks at a branch. */
  branch?: string;
  /** The file inside the repository, when the rule looks at a file. */
  path?: string;
  /** The commit, when the rule looks at a commit. */
  commit?: string;
  /** A sentence that explains what was found and why it matters. */
  message: string;
}

/** The part of a GitHub repository that the scanner reads. */
export interface RepositoryInfo {
  full_name: string;
  name: string;
  description: string | null;
  default_branch: string;
  pushed_at: string;
  archived: boolean;
}

/** One branch of a repository with the commit at its head. */
export interface BranchInfo {
  name: string;
  commit: { sha: string };
}

/** One entry of a recursive git tree. */
export interface TreeEntry {
  path: string;
  type: string;
  size?: number;
}

/** The part of a commit that the scanner reads. */
export interface CommitInfo {
  sha: string;
  commit: {
    message: string;
    committer: { date: string } | null;
  };
}

/** The function used to make HTTP requests, replaceable in tests. */
export type FetchFunction = (input: string, init?: RequestInit) => Promise<Response>;

/** The settings of a scan. */
export interface ScanOptions {
  /** A GitHub token, recommended to avoid the limit of 60 requests per hour. */
  token?: string;
  /** The highest number of branches read per repository. */
  maxBranches?: number;
  /** The base address of the GitHub REST API. */
  apiUrl?: string;
  fetch?: FetchFunction;
}
