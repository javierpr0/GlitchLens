import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { guardRequest } from "@/lib/bff-guard";
import { api } from "@/lib/glitchtip/api";
import { toIssueListFilter } from "@/lib/issues-filter";
import { getInstanceContext } from "@/lib/instances";
import { getActiveOrgSlug } from "@/lib/org";
import { canAccess } from "@/lib/permissions";
import { errorResponse, jsonError, readJson } from "@/lib/route-utils";

// One action may touch at most this many issues; past that the user repeats it. Keeps a request bounded.
const MAX_ISSUES = 10_000;
const PAGE = 100;
const CHUNK = 50;

const Body = z.object({
  action: z.enum(["count", "delete", "resolved", "ignored", "unresolved"]),
  filters: z.object({
    query: z.string().max(500).optional(),
    project: z.union([z.string().max(100), z.array(z.string().max(100)).max(100)]).optional(),
    environment: z.string().max(100).optional(),
    statsPeriod: z.string().max(20).optional(),
    sort: z.string().max(30).optional(),
  }),
  /** The number the user saw and confirmed. If the real count differs now, nothing is touched. */
  expectedCount: z.number().int().min(1).max(MAX_ISSUES).optional(),
});

/** Walks the list with the exact filters the page used, so the ids are what the user is looking at. */
async function collectIds(org: string, filter: ReturnType<typeof toIssueListFilter>) {
  const ids: string[] = [];
  let cursor: string | null = null;
  let capped = false;
  do {
    const page = await api.issues(org, { ...filter, cursor, limit: PAGE });
    for (const issue of page.data) {
      if (ids.length >= MAX_ISSUES) {
        capped = true;
        break;
      }
      ids.push(issue.id);
    }
    cursor = capped ? null : page.nextCursor;
  } while (cursor);
  return { ids, capped };
}

export async function POST(req: Request) {
  const guard = await guardRequest(req, { write: true });
  if (guard.response) return guard.response;
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;
  const { action, filters, expectedCount } = parsed.data;

  try {
    const ctx = await getInstanceContext();
    if (ctx.kind !== "ok") return jsonError("No usable GlitchTip instance.", 409);
    const org = await getActiveOrgSlug();
    if (!org) return jsonError("No organization selected.", 409);

    if (action === "delete" && !canAccess(guard.user.role, "DELETE", `organizations/${org}/issues`, ctx.instance.tokenMode)) {
      return jsonError("Your role does not allow this request.", 403);
    }

    const filter = toIssueListFilter(filters);
    const { ids, capped } = await collectIds(org, filter);
    if (action === "count") return NextResponse.json({ count: ids.length, capped });

    if (expectedCount === undefined) return jsonError("expectedCount is required.", 400);
    if (ids.length !== expectedCount) {
      return NextResponse.json(
        { error: `The number of matching issues changed (now ${ids.length}). Review the selection and try again.`, count: ids.length, capped },
        { status: 409 },
      );
    }

    let done = 0;
    let failure: unknown = null;
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        if (action === "delete") await api.bulkDeleteIssues(org, chunk);
        else await api.bulkUpdateIssues(org, chunk, { status: action });
        done += chunk.length;
      }
    } catch (e) {
      failure = e;
    }
    // Recorded even when a chunk fails, with how far it got: a partial mass delete must be traceable.
    recordAudit({
      actor: guard.user,
      action: action === "delete" ? "issues.bulk_delete" : "issues.bulk_update",
      target: `${ctx.instance.name} / ${org}`,
      detail: { requested: ids.length, done, status: action === "delete" ? undefined : action, query: filter.query, project: filter.project, environment: filter.environment },
      headers: req.headers,
    });
    if (failure) {
      const res = errorResponse(failure);
      return NextResponse.json({ ...(await res.json()), affected: done }, { status: res.status });
    }
    return NextResponse.json({ affected: done, capped });
  } catch (e) {
    return errorResponse(e);
  }
}
