"use client";

import type { ExceptionValue, StackFrame } from "@/lib/glitchtip/types";
import { cn } from "@/lib/utils";
import { ChevronRight, FileCode2, Info, Layers } from "lucide-react";
import { useState } from "react";

export function Stacktrace({ exception }: { exception: ExceptionValue }) {
  const allFrames = exception.stacktrace?.frames ?? [];
  // Sentry/GlitchTip convention: oldest first, most recent last. Reverse for display.
  const frames = [...allFrames].reverse();
  const [showSystem, setShowSystem] = useState(false);

  const hasInApp = frames.some((f) => f.inApp);
  const visible = !hasInApp || showSystem ? frames : frames.filter((f) => f.inApp);
  const hiddenCount = frames.length - visible.length;
  const hasAnyContext = frames.some((f) => f.context && f.context.length > 0);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="font-semibold text-sm text-foreground">{exception.type}</h3>
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {exception.value}
            </p>
            {exception.module && (
              <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground/60">
                module: {exception.module}
              </p>
            )}
          </div>
          {exception.mechanism && (
            <div className="flex shrink-0 items-center gap-1.5 text-[10px]">
              <span className="rounded border border-border bg-background/40 px-1.5 py-0.5 text-muted-foreground">
                {exception.mechanism.type}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5",
                  exception.mechanism.handled
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-red-500/15 text-red-400",
                )}
              >
                {exception.mechanism.handled ? "handled" : "unhandled"}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="border-b border-border bg-background/40 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="font-medium uppercase tracking-wider">Stacktrace</span>
        <span className="ml-2">
          {visible.length} frame{visible.length === 1 ? "" : "s"}
          {!hasAnyContext && " · no source context (upload source maps for code preview)"}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          This exception has no stack frames.
        </div>
      ) : (
        <ol>
          {visible.map((f, i) => (
            <Frame key={i} frame={f} index={i} defaultOpen={!!(f.context && f.context.length > 0 && i === 0)} />
          ))}
        </ol>
      )}

      {hiddenCount > 0 && (
        <button
          onClick={() => setShowSystem((s) => !s)}
          className="block w-full border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground hover:bg-muted/40"
        >
          {showSystem ? "Hide" : "Show"} {hiddenCount} system frame{hiddenCount === 1 ? "" : "s"}
        </button>
      )}
    </section>
  );
}

function Frame({
  frame,
  index,
  defaultOpen,
}: {
  frame: StackFrame;
  index: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const hasContext = !!frame.context && frame.context.length > 0;
  const filename = frame.filename || frame.module || "?";
  const fn = frame.function || "?";
  return (
    <li
      className={cn(
        "border-t border-border first:border-t-0",
        !frame.inApp && "opacity-70",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="grid w-full grid-cols-[auto_auto_1fr_auto] items-center gap-2.5 px-4 py-2.5 text-left text-xs hover:bg-muted/30"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-mono text-foreground">
          {filename}
          {frame.lineNo != null && (
            <span className="text-muted-foreground">
              {" "}:{frame.lineNo}
              {frame.colNo != null ? `:${frame.colNo}` : ""}
            </span>
          )}
          <span className="ml-2 text-muted-foreground">
            in <span className="text-foreground/80">{fn}</span>
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="font-mono text-[10px] text-muted-foreground/50">#{index}</span>
          {frame.inApp && (
            <span className="rounded bg-violet-500/15 px-1.5 text-[10px] font-medium text-violet-300">
              in app
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-background/40 px-4 py-2.5">
          <div className="grid grid-cols-[60px_1fr] gap-x-3 gap-y-1 text-[11px] sm:grid-cols-[80px_1fr]">
            {frame.absPath && (
              <>
                <span className="text-muted-foreground">URL</span>
                <a
                  href={frame.absPath}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-foreground/80 hover:text-primary"
                >
                  {frame.absPath}
                </a>
              </>
            )}
            <span className="text-muted-foreground">Function</span>
            <span className="break-all font-mono text-foreground/80">{fn}</span>
            {(frame.lineNo != null || frame.colNo != null) && (
              <>
                <span className="text-muted-foreground">Position</span>
                <span className="font-mono text-foreground/80">
                  line {frame.lineNo ?? "?"}{frame.colNo != null ? `, col ${frame.colNo}` : ""}
                </span>
              </>
            )}
            {frame.module && (
              <>
                <span className="text-muted-foreground">Module</span>
                <span className="break-all font-mono text-foreground/80">{frame.module}</span>
              </>
            )}
            {frame.package && (
              <>
                <span className="text-muted-foreground">Package</span>
                <span className="break-all font-mono text-foreground/80">{frame.package}</span>
              </>
            )}
          </div>

          {hasContext && frame.context && (
            <pre className="mt-3 overflow-x-auto rounded-md bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
              {frame.context.map(([line, src]) => (
                <div
                  key={line}
                  className={cn(
                    "flex gap-3",
                    line === frame.lineNo && "-mx-3 bg-violet-500/15 px-3",
                  )}
                >
                  <span className="w-10 shrink-0 select-none text-right text-muted-foreground/60">
                    {line}
                  </span>
                  <span className="whitespace-pre text-foreground/90">{src}</span>
                </div>
              ))}
            </pre>
          )}

          {!hasContext && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                No source context for this frame. Upload source maps via the GlitchTip CLI
                (<code className="font-mono">@sentry/cli sourcemaps upload</code>) to see the
                exact code lines.
              </span>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
