import { LoginForm } from "@/components/auth/login-form";
import { Activity, Layers, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { BrandTile } from "@/components/brand";
import { getCurrentUser } from "@/lib/auth";
import { setupPending } from "@/lib/bootstrap";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (setupPending()) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden border-r border-white/5 lg:flex">
        {/* Backdrop layers */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(124,58,237,0.18),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(168,85,247,0.10),_transparent_60%)]" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-violet-600/30 blur-[120px]" />
        <div className="absolute right-0 bottom-0 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-[120px]" />

        {/* Content */}
        <div className="relative z-10 flex w-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <BrandTile size="lg" />
            <span className="text-base font-semibold tracking-tight">GlitchLens</span>
          </div>

          <div className="max-w-lg space-y-6">
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">
              One lens on
              <br />
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-300 bg-clip-text text-transparent">
                every GlitchTip.
              </span>
            </h1>
            <p className="max-w-md text-base leading-relaxed text-zinc-400">
              A self-hosted dashboard for your GlitchTip servers. Bring your team, connect as many instances as you need.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
            <Feature icon={Activity} label="Live error feed" />
            <Feature icon={Layers} label="Multiple instances" />
            <Feature icon={ShieldCheck} label="Your data stays yours" />
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12 [padding-top:max(2rem,env(safe-area-inset-top))] [padding-bottom:max(2rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex items-center gap-3 lg:hidden">
            <BrandTile size="lg" />
            <span className="text-base font-semibold tracking-tight">GlitchLens</span>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-zinc-500">Use the account your administrator created for you.</p>
          </div>

          <LoginForm />
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 backdrop-blur">
      <Icon className="h-3 w-3 text-violet-300" />
      {label}
    </span>
  );
}
