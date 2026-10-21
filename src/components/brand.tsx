import { cn } from "@/lib/utils";

/** GlitchLens mark: a lens with a sliced, offset signal inside. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("h-full w-full", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      <circle cx="14.5" cy="14.5" r="8" strokeWidth="2.6" />
      <path d="M20.5 20.5 27 27" strokeWidth="3" />
      <path d="M10.5 12.5h7" strokeWidth="2" />
      <path d="M12.5 16.5h6" strokeWidth="2" opacity="0.65" />
    </svg>
  );
}

export function BrandTile({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <div
      className={cn(
        "grid place-items-center bg-violet-600 text-white",
        size === "sm" ? "h-7 w-7 rounded-md p-1" : "h-10 w-10 rounded-xl p-1.5 shadow-lg shadow-violet-900/40 ring-1 ring-white/10",
      )}
    >
      <LogoMark />
    </div>
  );
}
