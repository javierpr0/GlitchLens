"use client";

import { ChevronRight, Globe } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Pair = [string, unknown];

function toPairs(value: unknown): Pair[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (Array.isArray(value[0])) return value as Pair[];
    return null;
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>);
  }
  return null;
}

export function RequestPanel({ data }: { data: Record<string, unknown> }) {
  const url = (data.url as string | undefined) ?? null;
  const headers = toPairs(data.headers);
  const cookies = toPairs(data.cookies);
  const body = data.data;
  const env = data.env as Record<string, unknown> | null | undefined;

  let queryPairs: Pair[] | null = null;
  if (url) {
    try {
      const u = new URL(url);
      queryPairs = Array.from(u.searchParams.entries());
      if (queryPairs.length === 0) queryPairs = null;
    } catch { /* ignore */ }
  }

  if (!queryPairs && !headers && !body && !cookies && (!env || Object.keys(env).length === 0)) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
        <Globe className="h-3.5 w-3.5 shrink-0 text-sky-400" />
        <span className="text-xs font-semibold text-foreground">Request</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          details
        </span>
      </header>

      <div className="divide-y divide-border">
        {queryPairs && <Section title="Query parameters" pairs={queryPairs} />}
        {headers && <Section title="Headers" pairs={headers} mono />}
        {cookies && <Section title="Cookies" pairs={cookies} mono defaultOpen={false} />}
        {body !== null && body !== undefined && body !== "" && <BodySection body={body} />}
        {env && Object.keys(env).length > 0 && (
          <Section title="Environment" pairs={Object.entries(env)} mono defaultOpen={false} />
        )}
      </div>
    </section>
  );
}

function Section({
  title,
  pairs,
  mono,
  defaultOpen = true,
}: {
  title: string;
  pairs: Pair[];
  mono?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!pairs.length) return null;
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground hover:bg-muted/30"
      >
        <ChevronRight
          className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
        />
        {title}
        <span className="ml-auto normal-case text-muted-foreground/60">{pairs.length}</span>
      </button>
      {open && (
        <dl className="bg-background/30 text-xs">
          {pairs.map(([k, v], i) => (
            <div key={i} className="flex border-t border-border first:border-t-0">
              <dt
                className={cn(
                  "w-44 shrink-0 break-all bg-muted/20 px-3 py-2 text-muted-foreground",
                  mono && "font-mono",
                )}
              >
                {k}
              </dt>
              <dd className="min-w-0 flex-1 break-all px-3 py-2 font-mono">
                {formatValue(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function BodySection({ body }: { body: unknown }) {
  const [open, setOpen] = useState(true);
  let formatted: string;
  if (typeof body === "string") {
    formatted = body;
  } else {
    try {
      formatted = JSON.stringify(body, null, 2);
    } catch {
      formatted = String(body);
    }
  }
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground hover:bg-muted/30"
      >
        <ChevronRight
          className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
        />
        Body
      </button>
      {open && (
        <pre className="max-h-72 overflow-auto bg-background/30 p-3 font-mono text-[11px] leading-relaxed">
          {formatted}
        </pre>
      )}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (typeof v === "object") {
    try { return JSON.stringify(v, null, 2); } catch { return "[unserializable]"; }
  }
  return String(v);
}
