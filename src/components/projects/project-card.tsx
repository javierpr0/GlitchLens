import { Card, CardContent } from "@/components/ui/card";
import { relativeTime } from "@/lib/format";
import { PlatformIcon } from "@/components/platform-icon";
import type { Project } from "@/lib/glitchtip/types";
import { CalendarClock, ChevronRight } from "lucide-react";
import Link from "next/link";

export function ProjectCard({ project, orgSlug }: { project: Project; orgSlug: string }) {
  return (
    <Link
      href={`/projects/${orgSlug}/${project.slug}`}
      className="group block focus:outline-none focus:ring-2 focus:ring-ring rounded-xl"
    >
      <Card className="h-full overflow-hidden transition-colors hover:border-foreground/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10">
              <PlatformIcon platform={project.platform} size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{project.name}</div>
              <div className="truncate font-mono text-[11px] text-muted-foreground">
                {project.slug}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3 w-3" />
              {project.firstEvent ? `First event ${relativeTime(project.firstEvent)}` : "No events yet"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
