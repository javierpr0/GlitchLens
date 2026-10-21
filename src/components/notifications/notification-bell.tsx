"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { NotificationsResponse, Notification } from "@/lib/notifications/types";
import { formatDistanceToNow } from "date-fns";

const STORAGE_PREFIX = "glitchlens:notifications:lastSeenAt";
const POLL_MS = 60_000;

function dayAgo(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

const levelDot: Record<string, string> = {
  fatal: "bg-red-500",
  error: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-sky-500",
  debug: "bg-zinc-500",
};

export function NotificationBell({ userId, instanceId }: { userId?: string; instanceId: number }) {
  const storageKey = userId ? `${STORAGE_PREFIX}:${userId}:${instanceId}` : null;

  // Per-user "last seen" — userId arrives as a server prop, so it's stable from
  // first render (lazy init, no effect, no hydration mismatch: data loads later).
  const [lastSeen, setLastSeen] = useState<string>(() =>
    typeof window === "undefined" || !storageKey
      ? dayAgo()
      : localStorage.getItem(storageKey) || dayAgo(),
  );
  const [open, setOpen] = useState(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const { data } = useQuery<NotificationsResponse>({
    queryKey: ["notifications", instanceId],
    queryFn: async () => {
      const res = await fetch(`/api/notifications`, { cache: "no-store" });
      if (!res.ok) throw new Error("notifications");
      return res.json();
    },
    refetchInterval: POLL_MS,
  });

  const notifications = useMemo(() => data?.notifications ?? [], [data]);

  const unreadCount = useMemo(() => {
    const cutoff = new Date(lastSeen).getTime();
    return notifications.filter((n) => new Date(n.lastSeen).getTime() > cutoff).length;
  }, [notifications, lastSeen]);

  // Toast on truly new notification events (after first poll). Dedup by `n.id`
  // (`issueId-lastSeen`) so a recurring issue with fresh activity still toasts.
  useEffect(() => {
    if (!data) return;
    const ids = new Set(notifications.map((n) => n.id));

    if (!initializedRef.current) {
      knownIdsRef.current = ids;
      initializedRef.current = true;
      return;
    }

    const fresh: Notification[] = [];
    for (const n of notifications) {
      if (!knownIdsRef.current.has(n.id)) fresh.push(n);
    }
    knownIdsRef.current = ids;

    const cutoff = new Date(lastSeen).getTime();
    for (const n of fresh) {
      if (new Date(n.lastSeen).getTime() <= cutoff) continue;
      toast.error(n.title, {
        description: `${n.projectName} · ${n.shortId}`,
        action: {
          label: "Open",
          onClick: () => {
            // Toast actions run outside the React tree, so there is no router to use here.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = `/issues/${n.issueId}`;
          },
        },
      });
    }
  }, [data, notifications, lastSeen]);

  const markAllRead = () => {
    const now = new Date().toISOString();
    if (storageKey) localStorage.setItem(storageKey, now);
    setLastSeen(now);
  };

  const Icon = unreadCount > 0 ? BellRing : Bell;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          />
        }
      >
        <Icon className={cn("h-4 w-4", unreadCount > 0 && "text-violet-400")} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[calc(100vw-1.5rem)] max-w-sm p-0 sm:w-80">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <div className="text-sm font-medium">Notifications</div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Check className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No recent issues in the last 24 hours.
            </div>
          ) : (
            notifications.slice(0, 12).map((n) => {
              const isUnread = new Date(n.lastSeen).getTime() > new Date(lastSeen).getTime();
              return (
                <Link
                  key={n.id}
                  href={`/issues/${n.issueId}`}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block border-b border-border/50 px-3 py-2.5 last:border-0 hover:bg-accent/40",
                    isUnread && "bg-accent/20",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        levelDot[n.level] ?? "bg-zinc-500",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm leading-snug">{n.title}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="truncate">{n.projectName}</span>
                        <span>·</span>
                        <span>{n.count} events</span>
                        <span>·</span>
                        <span>
                          {formatDistanceToNow(new Date(n.lastSeen), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
        {notifications.length > 0 && (
          <div className="border-t border-border px-3 py-2 text-center">
            <Link
              href="/issues"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all issues
            </Link>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
