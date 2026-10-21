import { formatDistanceToNowStrict, format } from "date-fns";

export function relativeTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  try {
    return formatDistanceToNowStrict(new Date(date), { addSuffix: true });
  } catch {
    return "—";
  }
}

export function absoluteTime(date: string | Date | null | undefined, fmt = "PPp"): string {
  if (!date) return "—";
  try {
    return format(new Date(date), fmt);
  } catch {
    return "—";
  }
}

export function compactNumber(n: number | string | null | undefined): string {
  const num = Number(n ?? 0);
  if (!Number.isFinite(num)) return "0";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(num);
}

export function levelColor(level: string): string {
  switch (level) {
    case "fatal":
    case "error":
      return "bg-red-500/15 text-red-400 ring-1 ring-red-500/30";
    case "warning":
      return "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30";
    case "info":
      return "bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30";
    case "debug":
      return "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30";
  }
}

export function platformIcon(platform: string | null | undefined): string {
  switch (platform) {
    case "javascript":
    case "node":
      return "JS";
    case "python":
      return "PY";
    case "php":
      return "PHP";
    case "ruby":
      return "RB";
    case "go":
      return "GO";
    case "java":
      return "JA";
    case "csharp":
    case "dotnet":
      return "C#";
    case "rust":
      return "RS";
    case "swift":
    case "objc":
    case "cocoa":
      return "iOS";
    case "android":
      return "AN";
    default:
      return (platform ?? "?").slice(0, 2).toUpperCase();
  }
}
