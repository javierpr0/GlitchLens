import { z } from "zod";

export type IssueLevel = "fatal" | "error" | "warning" | "info" | "debug";
export type IssueStatus = "unresolved" | "resolved" | "ignored" | "reprocessing";
export type IssueType = "error" | "default" | "csp";

/**
 * Runtime guard for the issue list/detail boundary. Deliberately permissive
 * (`.passthrough()`, lax on optionals) — it exists to flag gross API drift, not
 * to reject every payload the hand-written types don't fully cover.
 */
export const IssueSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string(),
    level: z.string(),
    status: z.string(),
    project: z.object({ slug: z.string().optional() }).passthrough().optional(),
    lastSeen: z.string().optional(),
    firstSeen: z.string().optional(),
  })
  .passthrough();

export interface UserMe {
  id: string;
  username: string;
  email: string;
  name: string;
  isSuperuser: boolean;
  isActive: boolean;
  hasPasswordAuth: boolean;
  dateJoined: string;
  lastLogin: string | null;
  options: {
    timezone: string | null;
    stacktraceOrder: string | null;
    language: string | null;
    clock24Hours: boolean | null;
    preferredTheme: "system" | "light" | "dark" | null;
  };
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  dateCreated: string;
  status: { id: string; name: string };
  avatar: { avatarType: string; avatarUuid: string | null };
  isEarlyAdopter: boolean;
  require2fa: boolean;
  isAcceptingEvents: boolean;
  eventThrottleRate: number;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  platform: string | null;
  color: string;
  features: string[];
  hasAccess: boolean;
  isBookmarked: boolean;
  isInternal: boolean;
  isMember: boolean;
  isPublic: boolean;
  scrubIPAddresses: boolean;
  dateCreated: string;
  firstEvent: string | null;
  eventThrottleRate: number;
  organization?: Organization;
  avatar: { avatarType: string; avatarUuid: string | null };
}

export interface IssueMetadata {
  type?: string;
  value?: string;
  filename?: string;
  function?: string;
  title?: string;
}

export interface Issue {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  level: IssueLevel;
  type: IssueType;
  status: IssueStatus;
  count: string;
  userCount: number;
  numComments: number;
  permalink: string;
  project: Pick<Project, "id" | "slug" | "name" | "platform">;
  metadata: IssueMetadata;
  stats: { "24h"?: Array<[number, number]> };
  firstSeen: string;
  lastSeen: string;
  firstRelease: { version: string } | null;
  lastRelease: { version: string } | null;
  shareId: string | null;
  logger: string | null;
  statusDetails: Record<string, unknown>;
  subscriptionDetails: Record<string, unknown> | null;
  matchingEventId: string | null;
  assignedTo?: IssueAssignee | null;
}

export interface IssueAssignee {
  type?: "user" | "team";
  id: string | number;
  name?: string;
  email?: string;
  username?: string;
}

export interface StackFrame {
  filename: string;
  function: string;
  inApp: boolean;
  absPath?: string;
  colNo?: number | null;
  lineNo?: number | null;
  context?: Array<[number, string]>;
  vars?: Record<string, unknown>;
  module?: string;
  package?: string;
}

export interface ExceptionValue {
  type: string;
  value: string;
  module?: string;
  mechanism?: { type: string; handled: boolean; data?: Record<string, unknown> };
  stacktrace?: { frames: StackFrame[] };
}

export interface Breadcrumb {
  type?: string;
  category?: string;
  level?: string;
  message?: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export type EventEntry =
  | { type: "exception"; data: { values: ExceptionValue[]; hasSystemFrames?: boolean } }
  | { type: "breadcrumbs"; data: { values: Breadcrumb[] } }
  | { type: "request"; data: Record<string, unknown> }
  | { type: "message"; data: { formatted?: string; message?: string } }
  | { type: string; data: Record<string, unknown> };

export interface EventTagPair {
  key: string;
  value: string;
}

export interface IssueEvent {
  id: string;
  eventID: string;
  groupID: string;
  projectID: number;
  platform: string;
  type: string;
  message: string;
  culprit: string;
  dateCreated: string;
  dateReceived: string;
  metadata: IssueMetadata;
  tags: EventTagPair[];
  entries: EventEntry[];
  user?: { id?: string; email?: string; username?: string; ipAddress?: string } | null;
  contexts?: Record<string, Record<string, unknown>>;
  packages?: Record<string, string> | null;
  errors?: unknown[] | null;
  dist?: string | null;
}

export interface IssueTag {
  key: string;
  name: string;
  uniqueValues: number;
  totalValues: number;
  topValues: Array<{ key: string; name: string; value: string; count: number }>;
}

export interface ProjectKey {
  id: string;
  name: string;
  label: string;
  public: string;
  projectID: number;
  rateLimit: number | null;
  dateCreated: string;
  dsn: { public: string; secret: string; security: string };
}

export interface AlertRecipient {
  id: number;
  recipientType: "email" | "googlechat" | "slack" | "webhook" | "discord" | string;
  url: string;
  config: Record<string, unknown>;
  tagsToAdd: unknown[];
}

export interface AlertRule {
  id: number;
  name: string;
  timespanMinutes: number;
  quantity: number;
  uptime: boolean;
  alertRecipients: AlertRecipient[];
}

export interface Member {
  id: string;
  role: "owner" | "admin" | "member" | "manager" | string;
  roleName: string;
  email: string;
  dateCreated: string;
  pending: boolean;
  isOwner: boolean;
  user: UserMe | null;
}

export interface Team {
  id: string;
  slug: string;
  dateCreated: string;
  isMember: boolean;
  memberCount: number;
  projects: Project[];
}

export interface Environment {
  id: number;
  name: string;
  isHidden: boolean;
}

export interface UptimeMonitor {
  projectID: string;
  environmentID: string | null;
  isUp: boolean;
  lastChange: string;
  heartbeatEndpoint: string | null;
  projectName: string;
  envName: string | null;
  checks: Array<{ isUp: boolean; startCheck: string; reason: string | null }>;
}

export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
  maxHits: number;
}
