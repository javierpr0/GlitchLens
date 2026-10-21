"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid place-items-center py-20">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-500/15">
          <AlertTriangle className="h-5 w-5 text-red-400" />
        </div>
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "Unexpected error fetching data from GlitchTip."}
        </p>
        {error.digest && (
          <p className="mt-1 font-mono text-[10px] text-muted-foreground/60">
            digest: {error.digest}
          </p>
        )}
        <Button onClick={reset} className="mt-5 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </Button>
      </div>
    </div>
  );
}
