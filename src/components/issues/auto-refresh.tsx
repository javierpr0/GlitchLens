"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Play, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// 10s floor: each tick re-runs every Server Component on the page against the
// self-hosted GlitchTip, so sub-10s polling risks rate-limiting the instance.
const INTERVALS = [
  { value: 10_000, label: "Every 10s" },
  { value: 15_000, label: "Every 15s" },
  { value: 30_000, label: "Every 30s" },
  { value: 60_000, label: "Every 1m" },
  { value: 300_000, label: "Every 5m" },
];

const STORAGE_KEY = "glitchlens.autoRefresh";

interface Stored {
  on: boolean;
  interval: number;
}

function readStored(): Stored {
  if (typeof window === "undefined") return { on: false, interval: 15_000 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { on: false, interval: 15_000 };
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      on: !!parsed.on,
      interval: typeof parsed.interval === "number" ? parsed.interval : 15_000,
    };
  } catch {
    return { on: false, interval: 15_000 };
  }
}

export function AutoRefresh() {
  const router = useRouter();
  const [{ on, interval }, setState] = useState<Stored>({ on: false, interval: 15_000 });
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now()); // drives the "Xs ago" label
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load persisted state once on mount. It cannot be the initial state: the server render has no
  // localStorage, so reading it there would cause a hydration mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(readStored());
  }, []);

  // Persist
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ on, interval }));
  }, [on, interval]);

  const triggerRefresh = useCallback(() => {
    setRefreshing(true);
    router.refresh();
    const at = Date.now();
    setLastRefresh(at);
    setNow(at);
    // Recharts/UI animation hint
    setTimeout(() => setRefreshing(false), 600);
  }, [router]);

  // Polling
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!on) return;
    timerRef.current = setInterval(triggerRefresh, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [on, interval, triggerRefresh]);

  // Tick for "Xs ago" label every 1s, but stop after 2 min — second-granularity
  // past that is pointless and the interval would otherwise run forever.
  useEffect(() => {
    if (!lastRefresh) return;
    const t = setInterval(() => {
      if (Date.now() - lastRefresh > 120_000) {
        clearInterval(t);
        return;
      }
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(t);
  }, [lastRefresh]);

  const secondsAgo = lastRefresh ? Math.max(0, Math.floor((now - lastRefresh) / 1000)) : null;

  return (
    <div className="flex items-center gap-1">
      <Button
        variant={on ? "default" : "outline"}
        size="sm"
        onClick={() => setState((s) => ({ ...s, on: !s.on }))}
        className="gap-1.5"
        title={on ? "Pause auto-refresh" : "Enable auto-refresh"}
      >
        {on ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Live
          </>
        ) : (
          <>
            <Play className="h-3.5 w-3.5" /> Live
          </>
        )}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="gap-1" />}
        >
          {INTERVALS.find((i) => i.value === interval)?.label.replace("Every ", "") ?? "15s"}
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs">Refresh interval</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {INTERVALS.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => setState((s) => ({ ...s, interval: opt.value }))}
              className="gap-2"
            >
              <span className="flex-1">{opt.label}</span>
              {interval === opt.value && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="sm"
        onClick={triggerRefresh}
        disabled={refreshing}
        title="Refresh now"
        aria-label="Refresh now"
        className="gap-1.5"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
      </Button>

      {secondsAgo !== null && (
        <span className="ml-1 hidden text-[11px] text-muted-foreground sm:inline">
          updated {secondsAgo}s ago
        </span>
      )}
    </div>
  );
}
