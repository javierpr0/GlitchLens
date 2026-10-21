"use client";

import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";

const SORT_OPTIONS = [
  { value: "-avg_duration", label: "Slowest avg" },
  { value: "-count", label: "Most frequent" },
  { value: "transaction", label: "A → Z" },
];

export function PerformanceSort() {
  const router = useRouter();
  const params = useSearchParams();
  const activeSort = params.get("sort") ?? "-avg_duration";

  function setSort(value: string) {
    const next = new URLSearchParams(params.toString());
    next.delete("cursor");
    next.set("sort", value);
    router.push(`/performance?${next.toString()}`);
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1">
      {SORT_OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          variant={activeSort === opt.value ? "default" : "outline"}
          size="sm"
          onClick={() => setSort(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
