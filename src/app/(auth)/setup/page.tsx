import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { BrandTile } from "@/components/brand";
import { SetupForm } from "@/components/auth/setup-form";
import { getCurrentUser } from "@/lib/auth";
import { setupPending } from "@/lib/bootstrap";

export const metadata: Metadata = { title: "Set up GlitchLens" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!setupPending()) redirect((await getCurrentUser()) ? "/" : "/login");
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 [padding-top:max(2.5rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex items-center gap-3">
          <BrandTile size="lg" />
          <span className="text-base font-semibold tracking-tight">GlitchLens</span>
        </div>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Create the superadmin</h1>
          <p className="text-sm text-zinc-500">
            This account manages users and GlitchTip instances. The setup code is printed in the server console when
            GlitchLens starts.
          </p>
        </div>
        <SetupForm />
      </div>
    </div>
  );
}
