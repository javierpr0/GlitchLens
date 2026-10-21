"use client";

import type { IssueEvent } from "@/lib/glitchtip/types";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function EventJson({ event }: { event: IssueEvent }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(event, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      toast.success("JSON copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy.");
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Event payload
        </span>
        <Button variant="outline" size="xs" onClick={copy} className="gap-1.5">
          {copied ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-[600px] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-foreground/90">
        {json}
      </pre>
    </div>
  );
}
