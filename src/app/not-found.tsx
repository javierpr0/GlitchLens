import { buttonVariants } from "@/components/ui/button";
import { ArrowLeft, Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted">
          <Compass className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Lost in the stack</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          That page doesn&apos;t exist (or you don&apos;t have access).
        </p>
        <Link href="/" className={buttonVariants({ className: "mt-6 gap-1.5" })}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </Link>
      </div>
    </div>
  );
}
