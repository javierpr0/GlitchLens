import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/lib/format";
import { PlatformIcon } from "@/components/platform-icon";
import type { Project } from "@/lib/glitchtip/types";
import { ArrowUpRight, Boxes } from "lucide-react";
import Link from "next/link";

export function TopProjects({ projects, orgSlug }: { projects: Project[]; orgSlug: string }) {
  const ranked = [...projects]
    .sort((a, b) => {
      const da = a.firstEvent ? new Date(a.firstEvent).getTime() : 0;
      const db = b.firstEvent ? new Date(b.firstEvent).getTime() : 0;
      return db - da;
    })
    .slice(0, 8);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Boxes className="h-4 w-4 text-sky-400" /> Recent projects
        </CardTitle>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          View all <ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {ranked.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {ranked.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.organization?.slug ?? orgSlug}/${p.slug}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10">
                    <PlatformIcon platform={p.platform} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-sm">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.firstEvent ? `Last activity ${relativeTime(p.firstEvent)}` : "No events yet"}
                    </div>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
