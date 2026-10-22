export interface IssueSearchParams {
  query?: string;
  project?: string | string[];
  environment?: string;
  statsPeriod?: string;
  sort?: string;
}

export interface IssueListFilter {
  query?: string;
  project?: string[];
  environment?: string;
  statsPeriod: string;
  sort?: string;
}

/**
 * The one place that turns the issues page's URL params into what is sent to GlitchTip.
 * The list and the "select everything that matches" bulk actions both use it, so a bulk
 * action always touches exactly the issues the user is looking at.
 */
export function toIssueListFilter(sp: IssueSearchParams): IssueListFilter {
  // Defensive dedupe in case the URL gets polluted with repeated values.
  const raw = Array.isArray(sp.project) ? sp.project : sp.project ? [sp.project] : undefined;
  return {
    // Sentry default: when `query` is absent from the URL, filter to unresolved.
    // Empty string explicitly means "All" (user picked it).
    query: typeof sp.query === "string" ? sp.query || undefined : "is:unresolved",
    project: raw ? Array.from(new Set(raw)) : undefined,
    environment: sp.environment,
    statsPeriod: sp.statsPeriod ?? "14d",
    sort: sp.sort,
  };
}
