"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Comment {
  id: string;
  user: { id: string; name: string; email: string } | null;
  data: { text: string };
  dateCreated: string;
}

export function IssueComments({ issueId }: { issueId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const fetchComments = useCallback(async (): Promise<Comment[]> => {
    const res = await fetch(`/api/glitchtip/issues/${issueId}/comments`);
    if (!res.ok) throw new Error("Failed to load comments");
    return (await res.json()) as Comment[];
  }, [issueId]);

  async function load() {
    setLoading(true);
    try {
      setComments(await fetchComments());
    } catch {
      toast.error("Could not load comments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchComments()
      .then((data) => {
        if (!cancelled) setComments(data);
      })
      .catch(() => toast.error("Could not load comments."))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchComments]);

  async function submit() {
    if (!text.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/glitchtip/issues/${issueId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { text: text.trim() } }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        const detail =
          typeof body.error === "string"
            ? body.error
            : body.error
              ? JSON.stringify(body.error)
              : `HTTP ${res.status}`;
        throw new Error(detail);
      }
      setText("");
      await load();
      toast.success("Comment posted.");
    } catch (e) {
      toast.error(`Could not post comment: ${(e as Error).message}`);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Leave a note for your teammates..."
          className="min-h-[80px] w-full resize-y rounded-md border border-border bg-background/40 p-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={posting}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button onClick={submit} disabled={posting || !text.trim()} size="sm" className="gap-1.5">
            {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Post comment
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading comments…</p>
      ) : comments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground sm:py-10">
          <MessageSquare className="mx-auto mb-2 h-5 w-5 opacity-50" />
          No comments yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const name = c.user?.name || c.user?.email || "Unknown";
            const initials =
              name.split(/[\s@.]/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
            return (
              <li key={c.id} className="flex gap-3 rounded-lg border border-border bg-card p-3">
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback className="text-[10px] bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-[11px] text-muted-foreground">{relativeTime(c.dateCreated)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90">{c.data.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
