import { compactNumber } from "@/lib/format";
import { PlatformIcon, getPlatformLabel } from "@/components/platform-icon";
import type { Issue } from "@/lib/glitchtip/types";
import { Calendar, Hash, Monitor, User } from "lucide-react";

interface OsContext {
  name?: string;
  version?: string;
  build?: string;
  kernel_version?: string;
}

export function IssueSidebar({
  issue,
  eventUser,
  environment,
  os,
  firstSeenAbs,
  lastSeenAbs,
  firstSeenRel,
  lastSeenRel,
}: {
  issue: Issue;
  eventUser?: { id?: string; email?: string; username?: string; ipAddress?: string } | null;
  environment: string | null;
  os?: OsContext | null;
  firstSeenAbs: string;
  lastSeenAbs: string;
  firstSeenRel: string;
  lastSeenRel: string;
}) {
  const osLabel =
    os && (os.name || os.version)
      ? [os.name, os.version].filter(Boolean).join(" ")
      : null;

  return (
    <aside className="space-y-4">
      <Card title="Project">
        <div className="flex items-center gap-3 px-4 py-3 text-sm">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-background/40">
            <PlatformIcon platform={issue.project.platform} size={18} />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium leading-tight">{issue.project.name}</div>
            <div className="text-[11px] text-muted-foreground">
              {getPlatformLabel(issue.project.platform)}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Statistics">
        <Row label="Events" icon={Hash} value={compactNumber(issue.count)} />
        <Row label="Users affected" icon={User} value={compactNumber(issue.userCount)} />
        {environment && <Row label="Environment" value={environment} />}
      </Card>

      {osLabel && (
        <Card title="OS">
          <Row label="Name" icon={Monitor} value={osLabel} />
          {os?.build && <Row label="Build" value={os.build} />}
          {os?.kernel_version && <Row label="Kernel" value={os.kernel_version} />}
        </Card>
      )}

      <Card title="Timing">
        <Row
          label="First seen"
          icon={Calendar}
          value={firstSeenRel}
          subtext={firstSeenAbs}
        />
        <Row
          label="Last seen"
          icon={Calendar}
          value={lastSeenRel}
          subtext={lastSeenAbs}
        />
      </Card>

      {(eventUser?.email || eventUser?.username || eventUser?.ipAddress) && (
        <Card title="Last user">
          {eventUser.username && <Row label="Username" value={eventUser.username} />}
          {eventUser.email && <Row label="Email" value={eventUser.email} />}
          {eventUser.ipAddress && <Row label="IP" value={eventUser.ipAddress} />}
        </Card>
      )}
    </aside>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="border-b border-border bg-muted/30 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </header>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  icon: Icon,
  subtext,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  subtext?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <div className="min-w-0 text-right">
        <div className="truncate font-medium">{value}</div>
        {subtext && <div className="text-[10px] text-muted-foreground">{subtext}</div>}
      </div>
    </div>
  );
}
