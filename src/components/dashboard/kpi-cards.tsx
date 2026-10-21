import { Card, CardContent } from "@/components/ui/card";
import { compactNumber } from "@/lib/format";
import { AlertTriangle, Boxes, FolderKanban, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function KpiCards({
  totalIssues,
  totalEvents,
  projectCount,
  activeProjects,
}: {
  totalIssues: number;
  totalEvents: number;
  projectCount: number;
  activeProjects: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <Kpi
        label="Open issues"
        value={compactNumber(totalIssues)}
        icon={AlertTriangle}
        accent="text-amber-400"
      />
      <Kpi
        label="Events · 14 days"
        value={compactNumber(totalEvents)}
        icon={Zap}
        accent="text-violet-400"
      />
      <Kpi
        label="Projects"
        value={compactNumber(projectCount)}
        icon={FolderKanban}
        accent="text-sky-400"
      />
      <Kpi
        label="Reporting projects"
        value={compactNumber(activeProjects)}
        icon={Boxes}
        accent="text-emerald-400"
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
            {label}
          </span>
          <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:mt-3 sm:text-3xl">{value}</div>
      </CardContent>
    </Card>
  );
}
