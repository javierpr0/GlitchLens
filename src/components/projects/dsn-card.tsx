"use client";

import { Button } from "@/components/ui/button";
import type { ProjectKey } from "@/lib/glitchtip/types";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function DsnCard({ clientKey }: { clientKey: ProjectKey }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(clientKey.dsn.public);
      setCopied(true);
      toast.success("DSN copied to clipboard.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }
  return (
    <div className="rounded-lg border border-border bg-background/30 p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wider">{clientKey.label || "Default"}</span>
        <span className="font-mono">id: {clientKey.id.slice(0, 8)}…</span>
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted/40 px-2 py-1.5 font-mono text-xs text-foreground/90">
          {clientKey.dsn.public}
        </code>
        <Button variant="outline" size="sm" onClick={copy} className="gap-1.5">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
