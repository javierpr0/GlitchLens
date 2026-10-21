import type { Breadcrumb } from "@/lib/glitchtip/types";
import { cn } from "@/lib/utils";
import {
  Globe,
  MousePointerClick,
  Navigation,
  Network,
  Terminal,
  CircleDot,
  AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  navigation: Navigation,
  ui: MousePointerClick,
  "ui.click": MousePointerClick,
  console: Terminal,
  http: Network,
  fetch: Network,
  xhr: Network,
  default: CircleDot,
  error: AlertTriangle,
};

const LEVEL_COLOR: Record<string, string> = {
  info: "text-sky-400",
  debug: "text-zinc-400",
  warning: "text-amber-400",
  error: "text-red-400",
  fatal: "text-red-400",
};

export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No breadcrumbs.</p>;
  }
  // GlitchTip stores breadcrumbs oldest first; show in reverse so most recent is on top.
  const display = [...items].reverse();
  return (
    <ol className="overflow-hidden rounded-xl border border-border bg-card">
      {display.map((b, i) => {
        const Icon = ICONS[b.category ?? "default"] ?? ICONS.default ?? Globe;
        return (
          <li
            key={i}
            className="flex gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
          >
            <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", LEVEL_COLOR[b.level ?? "info"] ?? "text-muted-foreground")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-mono text-muted-foreground">{b.category ?? b.type ?? "event"}</span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
                  {b.timestamp ? new Date(b.timestamp).toLocaleTimeString() : ""}
                </span>
              </div>
              {b.message && (
                <p className="mt-0.5 text-foreground/90 [overflow-wrap:anywhere]">{b.message}</p>
              )}
              {b.data && Object.keys(b.data).length > 0 && (
                <pre className="mt-1 overflow-x-auto rounded bg-background/40 p-2 font-mono text-[10px] text-muted-foreground">
                  {JSON.stringify(b.data, null, 2)}
                </pre>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
