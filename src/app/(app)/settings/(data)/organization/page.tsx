import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrgSettingsForm } from "@/components/settings/org-settings-form";
import { api } from "@/lib/glitchtip/api";
import { getActiveOrgSlug } from "@/lib/org";
import { absoluteTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OrgSettingsPage() {
  const slug = await getActiveOrgSlug();
  if (!slug) return <p className="text-sm text-muted-foreground">No organization selected.</p>;
  const org = await api.organization(slug).catch(() => null);
  return (
    <div>
      <PageHeader title="Organization" description={org?.name ?? "Manage your organization."} />
      {!org ? (
        <p className="text-sm text-muted-foreground">Could not load organization.</p>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">General</CardTitle>
            </CardHeader>
            <CardContent>
              <OrgSettingsForm initial={org} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Slug" value={<span className="font-mono">{org.slug}</span>} />
              <Row label="ID" value={<span className="font-mono">{org.id}</span>} />
              <Row label="Created" value={absoluteTime(org.dateCreated)} />
              <Row
                label="Status"
                value={
                  <Badge variant="outline" className="capitalize">
                    {org.status.name}
                  </Badge>
                }
              />
              <Row label="Accepting events" value={org.isAcceptingEvents ? "Yes" : "No"} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
