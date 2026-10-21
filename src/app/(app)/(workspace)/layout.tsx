import { WorkspaceGuard } from "@/components/workspace-guard";
import type { ReactNode } from "react";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <WorkspaceGuard>{children}</WorkspaceGuard>;
}
