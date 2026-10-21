import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IssueActions } from "@/components/issues/issue-actions";
import { IssueComments } from "@/components/issues/issue-comments";
import { Stacktrace } from "@/components/issues/stacktrace";
import { Breadcrumbs } from "@/components/issues/breadcrumbs";
import { EventTags } from "@/components/issues/event-tags";
import { EventContext } from "@/components/issues/event-context";
import { EventJson } from "@/components/issues/event-json";
import { RequestPanel } from "@/components/issues/request-panel";
import { IssueSidebar } from "@/components/issues/issue-sidebar";
import { api, GlitchTipError } from "@/lib/glitchtip/api";
import { absoluteTime, levelColor, relativeTime } from "@/lib/format";
import type { ExceptionValue, Breadcrumb } from "@/lib/glitchtip/types";
import { cn, safeHttpUrl } from "@/lib/utils";
import { ArrowDown, ArrowLeft, Globe } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let issue;
  let event;
  let tags;
  try {
    [issue, event, tags] = await Promise.all([
      api.issue(id),
      api.issueLatestEvent(id).catch(() => null),
      api.issueTags(id).catch(() => []),
    ]);
  } catch (e) {
    if (e instanceof GlitchTipError && e.status === 404) notFound();
    throw e;
  }

  const exceptionEntry = event?.entries.find((e) => e.type === "exception") as
    | { type: "exception"; data: { values: ExceptionValue[]; hasSystemFrames?: boolean } }
    | undefined;
  const breadcrumbsEntry = event?.entries.find((e) => e.type === "breadcrumbs") as
    | { type: "breadcrumbs"; data: { values: Breadcrumb[] } }
    | undefined;
  const requestEntry = event?.entries.find((e) => e.type === "request");
  const messageEntry = event?.entries.find((e) => e.type === "message");
  const requestData = (requestEntry?.data as Record<string, unknown> | undefined) ?? null;
  const requestUrl = (requestData?.url as string | undefined) ?? null;
  const requestMethod = (requestData?.method as string | undefined) ?? null;

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <Link
            href="/issues"
            className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Back to issues
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex h-5 items-center rounded px-1.5 text-[10px] font-semibold uppercase tracking-wider",
                levelColor(issue.level),
              )}
            >
              {issue.level}
            </span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {issue.shortId}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {issue.status}
            </Badge>
          </div>
          <h1 className="mt-2 text-lg font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-xl">
            {issue.metadata?.type ?? issue.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {issue.metadata?.value || issue.title}
          </p>
          {issue.culprit && (
            <p className="mt-1 font-mono text-xs text-muted-foreground/70 break-all">
              {issue.culprit}
            </p>
          )}
          {requestUrl && (
            <div className="mt-2.5 flex items-start gap-2 text-xs">
              <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
              <div className="min-w-0">
                <span className="text-muted-foreground">URL · </span>
                {requestMethod && (
                  <span className="mr-1.5 rounded border border-border bg-background/40 px-1 font-mono text-[10px] uppercase">
                    {requestMethod}
                  </span>
                )}
                <a
                  href={safeHttpUrl(requestUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-foreground/90 hover:text-primary"
                >
                  {requestUrl}
                </a>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <IssueActions
            issueId={issue.id}
            status={issue.status}
            permalink={issue.permalink}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {event ? (
            <Tabs defaultValue="stacktrace" className="space-y-4">
              <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
              <TabsList className="w-max">
                <TabsTrigger value="stacktrace">Stacktrace</TabsTrigger>
                <TabsTrigger value="breadcrumbs">
                  Breadcrumbs{breadcrumbsEntry ? ` (${breadcrumbsEntry.data.values.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="tags">Tags</TabsTrigger>
                <TabsTrigger value="context">Context</TabsTrigger>
                <TabsTrigger value="comments">
                  Comments{issue.numComments ? ` (${issue.numComments})` : ""}
                </TabsTrigger>
                <TabsTrigger value="json">JSON</TabsTrigger>
              </TabsList>
              </div>
              <TabsContent value="stacktrace" className="space-y-4">
                {messageEntry?.data && !exceptionEntry && (
                  <pre className="overflow-x-auto rounded-lg border border-border bg-card/60 p-4 text-xs">
                    {(messageEntry.data as { formatted?: string; message?: string }).formatted ??
                      (messageEntry.data as { message?: string }).message}
                  </pre>
                )}
                {exceptionEntry?.data.values.map((ex, i, arr) => (
                  <div key={i} className="space-y-3">
                    <Stacktrace exception={ex} />
                    {i < arr.length - 1 && (
                      <div className="flex items-center gap-2 px-2 text-xs">
                        <div className="h-px flex-1 bg-border" />
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-0.5 text-muted-foreground">
                          <ArrowDown className="h-3 w-3" /> Caused by
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                  </div>
                ))}
                {!exceptionEntry && !messageEntry && (
                  <div className="rounded-lg border border-dashed border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">
                    No stacktrace in this event.
                  </div>
                )}
                {requestData && <RequestPanel data={requestData} />}
              </TabsContent>
              <TabsContent value="breadcrumbs">
                {breadcrumbsEntry ? (
                  <Breadcrumbs items={breadcrumbsEntry.data.values} />
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">
                    No breadcrumbs.
                  </div>
                )}
              </TabsContent>
              <TabsContent value="tags">
                <EventTags eventTags={event.tags} aggregated={tags} />
              </TabsContent>
              <TabsContent value="context">
                <EventContext event={event} />
              </TabsContent>
              <TabsContent value="comments">
                <IssueComments issueId={issue.id} />
              </TabsContent>
              <TabsContent value="json">
                <EventJson event={event} />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card/40 px-4 py-12 text-center text-sm text-muted-foreground">
              No events available for this issue yet.
            </div>
          )}
        </div>

        <IssueSidebar
          issue={issue}
          eventUser={event?.user ?? null}
          environment={event?.tags.find((t) => t.key === "environment")?.value ?? null}
          os={(event?.contexts as Record<string, unknown> | undefined)?.os as
            | { name?: string; version?: string; build?: string; kernel_version?: string }
            | undefined}
          firstSeenAbs={absoluteTime(issue.firstSeen)}
          lastSeenAbs={absoluteTime(issue.lastSeen)}
          firstSeenRel={relativeTime(issue.firstSeen)}
          lastSeenRel={relativeTime(issue.lastSeen)}
        />
      </div>
    </div>
  );
}
