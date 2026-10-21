import type { IssueEvent } from "@/lib/glitchtip/types";

// `os` is rendered in the issue sidebar, so we hide it here to avoid duplication.
const HIDDEN_CONTEXT_KEYS = new Set(["os"]);

export function EventContext({ event }: { event: IssueEvent }) {
  const contexts = event.contexts ?? {};
  const sections: Array<{ title: string; data: Record<string, unknown> }> = [];

  for (const [name, data] of Object.entries(contexts)) {
    if (HIDDEN_CONTEXT_KEYS.has(name.toLowerCase())) continue;
    if (data && typeof data === "object") sections.push({ title: name, data });
  }

  if (sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No additional context. Request details now live on the Stacktrace tab.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <section key={s.title} className="overflow-hidden rounded-xl border border-border bg-card">
          <header className="border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {s.title}
          </header>
          <dl className="divide-y divide-border text-sm">
            {Object.entries(s.data).map(([k, v]) => (
              <div key={k} className="flex">
                <dt className="w-24 shrink-0 bg-muted/20 px-3 py-2 font-mono text-xs text-muted-foreground sm:w-44 sm:px-4">
                  {k}
                </dt>
                <dd className="min-w-0 flex-1 px-3 py-2 font-mono text-xs [overflow-wrap:anywhere] sm:px-4">
                  {formatValue(v)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return "[unserializable]";
    }
  }
  return String(v);
}
