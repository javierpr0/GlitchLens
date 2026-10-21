import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertRuleDialog } from "@/components/alerts/alert-rule-dialog";
import { AlertRuleRow } from "@/components/alerts/alert-rule-row";
import { api } from "@/lib/glitchtip/api";
import { getActiveOrgSlug } from "@/lib/org";
import { PlatformIcon } from "@/components/platform-icon";
import { Bell, Plus } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Alerts" };
export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const org = await getActiveOrgSlug();
  if (!org)
    return (
      <EmptyState
        icon={Bell}
        title="No organization"
        description="Select an organization to manage alerts."
      />
    );

  const projects = await api.organizationProjects(org).catch(() => []);
  const projectAlerts = await Promise.all(
    projects.map(async (p) => ({
      project: p,
      alerts: await api.projectAlerts(org, p.slug).catch(() => []),
    })),
  );

  const totalRules = projectAlerts.reduce((acc, p) => acc + p.alerts.length, 0);

  return (
    <div>
      <PageHeader
        title="Alerts"
        description={`${totalRules} rule${totalRules === 1 ? "" : "s"} across ${projects.length} project${projects.length === 1 ? "" : "s"}.`}
      />
      {projects.length === 0 && (
        <EmptyState
          icon={Bell}
          title="No projects yet"
          description="Create a project first, then define alert rules per project."
        />
      )}
      <div className="space-y-4">
        {projectAlerts.map(({ project, alerts }) => (
          <Card key={project.id}>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border bg-background/40">
                    <PlatformIcon platform={project.platform} size={12} />
                  </span>
                  <Link
                    href={`/projects/${org}/${project.slug}`}
                    className="text-sm font-medium hover:text-primary"
                  >
                    {project.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    · {alerts.length} rule{alerts.length === 1 ? "" : "s"}
                  </span>
                </div>
                <AlertRuleDialog
                  orgSlug={org}
                  projectSlug={project.slug}
                  trigger={
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> New rule
                    </Button>
                  }
                />
              </div>
              {alerts.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-background/20 px-3 py-4 text-center text-xs text-muted-foreground">
                  No rules yet for this project.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {alerts.map((a) => (
                    <AlertRuleRow key={a.id} orgSlug={org} projectSlug={project.slug} rule={a} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
