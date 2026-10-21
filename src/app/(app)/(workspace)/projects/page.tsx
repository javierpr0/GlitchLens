import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { CreateProject } from "@/components/projects/create-project";
import { ProjectCard } from "@/components/projects/project-card";
import { api } from "@/lib/glitchtip/api";
import { getActiveOrgSlug } from "@/lib/org";
import { FolderKanban } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const org = await getActiveOrgSlug();
  if (!org) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="No organization selected"
        description="Select an organization to see its projects."
      />
    );
  }
  const [projects, teams] = await Promise.all([
    api.organizationProjects(org).catch(() => []),
    api.teams(org).catch(() => []),
  ]);
  return (
    <div>
      <PageHeader
        title="Projects"
        description={`${projects.length} project${projects.length === 1 ? "" : "s"} in this organization.`}
        actions={teams.length > 0 ? <CreateProject orgSlug={org} teams={teams} /> : null}
      />
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create your first project to start receiving events."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} orgSlug={org} />
          ))}
        </div>
      )}
    </div>
  );
}
