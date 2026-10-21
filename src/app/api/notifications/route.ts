import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/bff-guard";
import { api } from "@/lib/glitchtip/api";
import { getActiveOrgSlug } from "@/lib/org";
import type { Notification } from "@/lib/notifications/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await guardRequest(req);
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const sinceDate = since ? new Date(since) : null;
  const validSince = sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate : null;

  try {
    const slug = await getActiveOrgSlug();
    if (!slug) {
      return NextResponse.json({ notifications: [], serverTime: new Date().toISOString() });
    }
    const page = await api.issues(slug, {
      statsPeriod: "24h",
      sort: "last_seen",
      limit: 20,
    });

    const notifications: Notification[] = page.data
      .filter((issue) => {
        if (issue.status !== "unresolved") return false;
        if (!validSince) return true;
        return new Date(issue.lastSeen) > validSince;
      })
      .map((issue) => ({
        id: `${issue.id}-${issue.lastSeen}`,
        issueId: String(issue.id),
        shortId: issue.shortId,
        title: issue.title,
        level: issue.level,
        projectName: issue.project?.name ?? "Unknown",
        projectSlug: issue.project?.slug ?? "",
        count: String(issue.count ?? "0"),
        lastSeen: issue.lastSeen,
        firstSeen: issue.firstSeen,
        isNew: validSince ? new Date(issue.firstSeen) > validSince : false,
      }));

    return NextResponse.json({
      notifications,
      serverTime: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({
      notifications: [],
      serverTime: new Date().toISOString(),
    });
  }
}
