import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="grid place-items-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
