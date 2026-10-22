import "server-only";
import { glitchtipFetch, glitchtipFetchPaginated } from "./client";
import { IssueSchema } from "./types";
import type {
  AlertRecipient,
  AlertRule,
  Environment,
  Issue,
  IssueEvent,
  IssueStatus,
  IssueTag,
  Member,
  Organization,
  Paginated,
  Project,
  ProjectKey,
  Team,
  UptimeMonitor,
} from "./types";

export interface IssueComment {
  id: string;
  user: { id: string; name: string; email: string } | null;
  data: { text: string };
  dateCreated: string;
  type: string;
}

export interface Release {
  version: string;
  shortVersion: string;
  ref: string | null;
  url: string | null;
  dateCreated: string;
  dateReleased: string | null;
  data: Record<string, unknown>;
  newGroups: number;
  owner: unknown | null;
  commitCount: number;
  lastEvent: string | null;
  firstEvent: string | null;
  lastCommit: unknown | null;
  authors: unknown[];
  projects: Array<{ name: string; slug: string }>;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  body: string;
  severityText: string;
  severityNumber: number;
  attributes: Record<string, unknown>;
  resource?: Record<string, unknown>;
}

export interface TransactionGroup {
  id: number;
  project: number;
  transaction: string;
  op: string;
  method: string | null;
  count: number;
  avgDuration: number;
  p50: number;
  p95: number;
  errorCount: number;
  errorRate: number;
  throughput: number;
  firstSeen: string;
  lastSeen: string;
}

export interface DebugFile {
  id: string;
  uuid: string;
  debugId?: string;
  cpuName?: string;
  objectName?: string;
  symbolType?: string;
  size: number;
  sha1?: string;
  dateCreated: string;
  data: Record<string, unknown>;
  headers?: Record<string, unknown>;
}

export const api = {
  // Orgs
  organizations: () => glitchtipFetch<Organization[]>("/api/0/organizations/"),
  organization: (slug: string) => glitchtipFetch<Organization>(`/api/0/organizations/${slug}/`),
  members: (org: string) => glitchtipFetch<Member[]>(`/api/0/organizations/${org}/members/`),
  teams: (org: string) => glitchtipFetch<Team[]>(`/api/0/organizations/${org}/teams/`),
  monitors: (org: string) => glitchtipFetch<UptimeMonitor[]>(`/api/0/organizations/${org}/monitors/`),

  // Projects
  projects: () => glitchtipFetch<Project[]>("/api/0/projects/"),
  organizationProjects: (org: string) =>
    glitchtipFetch<Project[]>(`/api/0/organizations/${org}/projects/`),
  project: (org: string, slug: string) =>
    glitchtipFetch<Project>(`/api/0/projects/${org}/${slug}/`),
  projectKeys: (org: string, slug: string) =>
    glitchtipFetch<ProjectKey[]>(`/api/0/projects/${org}/${slug}/keys/`),
  projectAlerts: (org: string, slug: string) =>
    glitchtipFetch<AlertRule[]>(`/api/0/projects/${org}/${slug}/alerts/`),
  projectEnvironments: (org: string, slug: string) =>
    glitchtipFetch<Environment[]>(`/api/0/projects/${org}/${slug}/environments/`),

  // Issues
  issues: (
    org: string,
    opts: {
      cursor?: string | null;
      limit?: number;
      query?: string;
      project?: string | string[];
      environment?: string;
      statsPeriod?: string;
      sort?: string;
    } = {},
  ): Promise<Paginated<Issue>> => {
    const sp: Record<string, string | string[]> = {};
    if (opts.query) sp.query = opts.query;
    if (opts.environment) sp.environment = opts.environment;
    if (opts.statsPeriod) sp.statsPeriod = opts.statsPeriod;
    if (opts.sort) sp.sort = opts.sort;
    if (opts.project) sp.project = opts.project;
    return glitchtipFetchPaginated<Issue>(`/api/0/organizations/${org}/issues/`, {
      cursor: opts.cursor,
      limit: opts.limit ?? 25,
      searchParams: sp,
      schema: IssueSchema,
    });
  },
  /** Bulk change by explicit ids (GlitchTip also filters by query, but ids guarantee we touch exactly what was counted). */
  bulkUpdateIssues: (org: string, ids: string[], body: Partial<{ status: IssueStatus }>) =>
    glitchtipFetch<unknown>(`/api/0/organizations/${org}/issues/`, { method: "PUT", searchParams: { id: ids }, body }),
  bulkDeleteIssues: (org: string, ids: string[]) =>
    glitchtipFetch<unknown>(`/api/0/organizations/${org}/issues/`, { method: "DELETE", searchParams: { id: ids } }),
  issue: (id: string) => glitchtipFetch<Issue>(`/api/0/issues/${id}/`, { schema: IssueSchema }),
  issueLatestEvent: (id: string) =>
    glitchtipFetch<IssueEvent>(`/api/0/issues/${id}/events/latest/`),
  issueTags: (id: string) => glitchtipFetch<IssueTag[]>(`/api/0/issues/${id}/tags/`),
  issueComments: (id: string) =>
    glitchtipFetch<IssueComment[]>(`/api/0/issues/${id}/comments/`),
  addIssueComment: (id: string, text: string) =>
    glitchtipFetch<IssueComment>(`/api/0/issues/${id}/comments/`, {
      method: "POST",
      body: { data: { text } },
    }),
  updateIssue: (id: string, body: Partial<{ status: IssueStatus; assignedTo: string | null; isSubscribed: boolean }>) =>
    glitchtipFetch<Issue>(`/api/0/issues/${id}/`, { method: "PUT", body }),
  deleteIssue: (id: string) =>
    glitchtipFetch<void>(`/api/0/issues/${id}/`, { method: "DELETE" }),

  // Releases & logs
  releases: (org: string) =>
    glitchtipFetch<Release[]>(`/api/0/organizations/${org}/releases/`),
  logs: (org: string) => glitchtipFetch<LogEntry[]>(`/api/0/organizations/${org}/logs/`),

  // Performance
  transactionGroups: (
    org: string,
    opts: { cursor?: string | null; limit?: number; project?: string | string[]; sort?: string } = {},
  ): Promise<Paginated<TransactionGroup>> => {
    const sp: Record<string, string | string[]> = {};
    if (opts.project) sp.project = opts.project;
    if (opts.sort) sp.sort = opts.sort;
    return glitchtipFetchPaginated<TransactionGroup>(
      `/api/0/organizations/${org}/transaction-groups/`,
      { cursor: opts.cursor, limit: opts.limit ?? 25, searchParams: sp },
    );
  },
  transactionGroup: (org: string, id: string) =>
    glitchtipFetch<TransactionGroup>(`/api/0/organizations/${org}/transaction-groups/${id}/`),
  transactionSpans: (org: string, id: string) =>
    glitchtipFetch<unknown[]>(`/api/0/organizations/${org}/transaction-groups/${id}/spans/`),

  // Project CRUD
  createProject: (org: string, team: string, body: { name: string; slug?: string; platform?: string }) =>
    glitchtipFetch<Project>(`/api/0/teams/${org}/${team}/projects/`, {
      method: "POST",
      body,
    }),
  updateProject: (org: string, slug: string, body: Partial<Project>) =>
    glitchtipFetch<Project>(`/api/0/projects/${org}/${slug}/`, { method: "PUT", body }),
  deleteProject: (org: string, slug: string) =>
    glitchtipFetch<void>(`/api/0/projects/${org}/${slug}/`, { method: "DELETE" }),

  // Project keys
  createProjectKey: (org: string, slug: string, body: { name?: string }) =>
    glitchtipFetch<ProjectKey>(`/api/0/projects/${org}/${slug}/keys/`, {
      method: "POST",
      body,
    }),
  deleteProjectKey: (org: string, slug: string, keyId: string) =>
    glitchtipFetch<void>(`/api/0/projects/${org}/${slug}/keys/${keyId}/`, {
      method: "DELETE",
    }),

  // Debug files (source maps & dsyms)
  debugFiles: (org: string, slug: string) =>
    glitchtipFetch<DebugFile[]>(`/api/0/projects/${org}/${slug}/files/dsyms/`),

  // Members
  inviteMember: (org: string, body: { email: string; role: string; teams?: string[] }) =>
    glitchtipFetch<Member>(`/api/0/organizations/${org}/members/`, {
      method: "POST",
      body,
    }),
  updateMember: (org: string, memberId: string, body: { role: string }) =>
    glitchtipFetch<Member>(`/api/0/organizations/${org}/members/${memberId}/`, {
      method: "PUT",
      body,
    }),
  removeMember: (org: string, memberId: string) =>
    glitchtipFetch<void>(`/api/0/organizations/${org}/members/${memberId}/`, {
      method: "DELETE",
    }),

  // Teams
  createTeam: (org: string, body: { slug: string }) =>
    glitchtipFetch<Team>(`/api/0/organizations/${org}/teams/`, { method: "POST", body }),
  deleteTeam: (org: string, teamSlug: string) =>
    glitchtipFetch<void>(`/api/0/teams/${org}/${teamSlug}/`, { method: "DELETE" }),
  addTeamProject: (org: string, teamSlug: string, projectSlug: string) =>
    glitchtipFetch<void>(`/api/0/projects/${org}/${projectSlug}/teams/${teamSlug}/`, {
      method: "POST",
    }),
  removeTeamProject: (org: string, teamSlug: string, projectSlug: string) =>
    glitchtipFetch<void>(`/api/0/projects/${org}/${projectSlug}/teams/${teamSlug}/`, {
      method: "DELETE",
    }),

  // Alert rules
  alertRule: (org: string, slug: string, id: string) =>
    glitchtipFetch<AlertRule>(`/api/0/projects/${org}/${slug}/alerts/${id}/`),
  createAlertRule: (org: string, slug: string, body: Partial<AlertRule> & { alertRecipients?: Partial<AlertRecipient>[] }) =>
    glitchtipFetch<AlertRule>(`/api/0/projects/${org}/${slug}/alerts/`, {
      method: "POST",
      body,
    }),
  updateAlertRule: (org: string, slug: string, id: string, body: Partial<AlertRule>) =>
    glitchtipFetch<AlertRule>(`/api/0/projects/${org}/${slug}/alerts/${id}/`, {
      method: "PUT",
      body,
    }),
  deleteAlertRule: (org: string, slug: string, id: string) =>
    glitchtipFetch<void>(`/api/0/projects/${org}/${slug}/alerts/${id}/`, {
      method: "DELETE",
    }),

  // Org settings
  updateOrganization: (org: string, body: Partial<Organization>) =>
    glitchtipFetch<Organization>(`/api/0/organizations/${org}/`, { method: "PUT", body }),

  // Stats v2: needs category, start, end, field
  stats: (
    org: string,
    opts: {
      category: "error" | "transaction" | "default" | string;
      start: string;
      end: string;
      field?: string;
      groupBy?: string | string[];
      interval?: string;
      project?: string;
    },
  ) => {
    const sp: Record<string, string> = {
      category: opts.category,
      start: opts.start,
      end: opts.end,
      field: opts.field ?? "sum(quantity)",
    };
    if (opts.interval) sp.interval = opts.interval;
    if (opts.project) sp.project = opts.project;
    if (opts.groupBy) {
      const arr = Array.isArray(opts.groupBy) ? opts.groupBy : [opts.groupBy];
      arr.forEach((g, i) => (sp[`groupBy${i ? i : ""}`] = g));
    }
    return glitchtipFetch<{
      start: string;
      end: string;
      intervals: string[];
      groups: Array<{
        by: Record<string, string | number>;
        totals: Record<string, number>;
        series: Record<string, number[]>;
      }>;
    }>(`/api/0/organizations/${org}/stats_v2/`, { searchParams: sp });
  },
};

export { GlitchTipError } from "./client";
