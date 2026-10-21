import type { EventTagPair, IssueTag } from "@/lib/glitchtip/types";

export function EventTags({
  eventTags,
  aggregated,
}: {
  eventTags: EventTagPair[];
  aggregated: IssueTag[];
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Event tags
        </h3>
        <dl className="overflow-hidden rounded-lg border border-border bg-card text-sm">
          {eventTags.map((t, i) => (
            <div key={i} className="flex border-b border-border last:border-b-0">
              <dt className="w-24 shrink-0 bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground sm:w-40">
                {t.key}
              </dt>
              <dd className="min-w-0 flex-1 px-3 py-2 [overflow-wrap:anywhere]">{t.value}</dd>
            </div>
          ))}
          {eventTags.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No tags.</div>
          )}
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Top values across issue
        </h3>
        <div className="space-y-3">
          {aggregated.map((tag) => (
            <div key={tag.key} className="rounded-lg border border-border bg-card p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2 text-xs">
                <span className="font-mono text-foreground">{tag.key}</span>
                <span className="text-muted-foreground">
                  {tag.uniqueValues} unique · {tag.totalValues} total
                </span>
              </div>
              <ul className="space-y-1">
                {tag.topValues.slice(0, 5).map((v, i) => {
                  const pct = Math.round((v.count / Math.max(tag.totalValues, 1)) * 100);
                  return (
                    <li key={i} className="relative h-6 overflow-hidden rounded bg-muted/30">
                      <div
                        className="absolute inset-y-0 left-0 bg-violet-500/15"
                        style={{ width: `${pct}%` }}
                      />
                      <div className="relative flex h-full items-center justify-between px-2 text-xs">
                        <span className="truncate">{v.value}</span>
                        <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                          {pct}%
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {aggregated.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-card/40 px-3 py-6 text-center text-sm text-muted-foreground">
              No aggregated tags.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
