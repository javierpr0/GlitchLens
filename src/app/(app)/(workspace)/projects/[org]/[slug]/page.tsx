import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KeysManager } from "@/components/projects/keys-manager";
import { ProjectActions } from "@/components/projects/project-actions";
import { SetupSnippet } from "@/components/projects/setup-snippet";
import { api, GlitchTipError } from "@/lib/glitchtip/api";
import { absoluteTime, relativeTime } from "@/lib/format";
import { PlatformIcon, getPlatformLabel } from "@/components/platform-icon";
import { ArrowLeft, FileWarning } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProjectDetail({
  params,
}: {
  params: Promise<{ org: string; slug: string }>;
}) {
  const { org, slug } = await params;
  let project, keys, alerts, environments, dsyms;
  try {
    [project, keys, alerts, environments, dsyms] = await Promise.all([
      api.project(org, slug),
      api.projectKeys(org, slug).catch(() => []),
      api.projectAlerts(org, slug).catch(() => []),
      api.projectEnvironments(org, slug).catch(() => []),
      api.debugFiles(org, slug).catch(() => []),
    ]);
  } catch (e) {
    if (e instanceof GlitchTipError && e.status === 404) notFound();
    throw e;
  }
  return (
    <div>
      <Link
        href="/projects"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back to projects
      </Link>
      <PageHeader
        title={project.name}
        description={`Created ${relativeTime(project.dateCreated)} · ${absoluteTime(project.dateCreated)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5 font-mono text-[10px]">
              <span className="opacity-60">platform:</span>
              {project.platform ?? "unknown"}
            </Badge>
            <ProjectActions orgSlug={org} projectSlug={slug} />
          </div>
        }
      />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Client keys (DSN)</CardTitle>
            </CardHeader>
            <CardContent>
              <KeysManager orgSlug={org} projectSlug={slug} keys={keys} />
            </CardContent>
          </Card>

          <SetupSnippet platform={project.platform} dsn={keys[0]?.dsn.public ?? ""} />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileWarning className="h-4 w-4 text-amber-400" /> Source maps & debug files
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dsyms.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No debug files uploaded. Use{" "}
                  <code className="font-mono text-xs">@sentry/cli sourcemaps upload</code> to enable
                  un-minified stacktraces.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {dsyms.slice(0, 20).map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-foreground/90">
                          {d.objectName ?? d.uuid}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {(d.size / 1024).toFixed(1)} KB · {relativeTime(d.dateCreated)}
                        </div>
                      </div>
                      {d.cpuName && (
                        <Badge variant="outline" className="text-[10px]">{d.cpuName}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {alerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Alert rules</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.name || `Rule #${a.id}`}</div>
                      <div className="text-xs text-muted-foreground">
                        Trigger when ≥ {a.quantity} events in {a.timespanMinutes} min
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {a.alertRecipients.map((r) => (
                        <Badge key={r.id} variant="outline" className="text-[10px]">
                          {r.recipientType}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Project</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border bg-background/40">
                  <PlatformIcon platform={project.platform} size={12} />
                </span>
                <span className="font-medium">{project.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {getPlatformLabel(project.platform)}
                </span>
              </div>
              <Field label="Slug" value={project.slug} mono />
              <Field label="ID" value={project.id} mono />
              <Field
                label="First event"
                value={project.firstEvent ? relativeTime(project.firstEvent) : "Never"}
              />
              <Field
                label="Scrub IPs"
                value={project.scrubIPAddresses ? "Yes" : "No"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Environments</CardTitle>
            </CardHeader>
            <CardContent>
              {environments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No environments yet.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {environments.map((e) => (
                    <Badge key={e.id} variant="outline" className="text-xs">
                      {e.name}
                    </Badge>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "text-sm"}>{value}</span>
    </div>
  );
}
