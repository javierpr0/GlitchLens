import { SettingsNav } from "@/components/settings/settings-nav";
import { requireUser } from "@/lib/auth";
import type { ReactNode } from "react";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-[200px_1fr]">
      <SettingsNav isSuperadmin={user.role === "superadmin"} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
