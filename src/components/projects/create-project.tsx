"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlatformIcon, PLATFORM_GROUPS, getPlatformLabel } from "@/components/platform-icon";
import type { Team } from "@/lib/glitchtip/types";
import { ArrowLeft, ChevronDown, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type TeamMode = "existing" | "new";

export function CreateProject({
  orgSlug,
  teams,
}: {
  orgSlug: string;
  teams: Team[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [teamMode, setTeamMode] = useState<TeamMode>(teams.length > 0 ? "existing" : "new");
  const [team, setTeam] = useState(teams[0]?.slug ?? "");
  const [newTeamSlug, setNewTeamSlug] = useState("");
  const [platform, setPlatform] = useState("javascript");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName("");
    setNewTeamSlug("");
    setTeamMode(teams.length > 0 ? "existing" : "new");
    setTeam(teams[0]?.slug ?? "");
    setPlatform("javascript");
  }

  function normalizeSlug(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  }

  async function submit() {
    if (!name.trim()) return;

    let targetTeam = team;

    if (teamMode === "new") {
      const slug = normalizeSlug(newTeamSlug);
      if (!slug) {
        toast.error("Enter a valid team slug.");
        return;
      }
      setSubmitting(true);
      try {
        const res = await fetch(`/api/glitchtip/organizations/${orgSlug}/teams`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? "team creation failed");
        }
        targetTeam = slug;
        toast.success(`Team #${slug} created.`);
      } catch (e) {
        toast.error(`Could not create team: ${(e as Error).message}`);
        setSubmitting(false);
        return;
      }
    } else if (!targetTeam) {
      toast.error("Pick or create a team first.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/glitchtip/teams/${orgSlug}/${targetTeam}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), platform }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail = (body as { error?: unknown }).error;
        const msg = typeof detail === "string"
          ? detail
          : detail
            ? JSON.stringify(detail)
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      toast.success("Project created.");
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      toast.error(`Could not create project: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !!name.trim() &&
    (teamMode === "existing" ? !!team : !!normalizeSlug(newTeamSlug));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
        <Plus className="h-3.5 w-3.5" /> New project
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a project</DialogTitle>
          <DialogDescription>You&apos;ll get a DSN to start sending events.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="proj-name">Name</Label>
            <Input
              id="proj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Frontend"
              className="bg-background"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Team</Label>
              {teamMode === "existing"
                ? teams.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTeamMode("new")}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" /> Create new team
                    </button>
                  )
                : teams.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTeamMode("existing")}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="h-3 w-3" /> Pick existing
                    </button>
                  )}
            </div>

            {teamMode === "existing" ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button type="button" variant="outline" size="sm" className="w-full justify-between" />}
                >
                  <span>#{team || "select"}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-(--anchor-width) max-h-60 overflow-auto">
                  {teams.map((t) => (
                    <DropdownMenuItem key={t.id} onClick={() => setTeam(t.slug)}>
                      #{t.slug}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="space-y-1">
                <Input
                  value={newTeamSlug}
                  onChange={(e) => setNewTeamSlug(e.target.value)}
                  placeholder="new-team-slug"
                  className="bg-background font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Lowercase letters, numbers and hyphens only. The team will be created before the project.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Platform</Label>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button type="button" variant="outline" size="sm" className="w-full justify-between gap-2" />}
              >
                <span className="flex items-center gap-2">
                  <PlatformIcon platform={platform} size={14} />
                  {getPlatformLabel(platform)}
                </span>
                <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-(--anchor-width) max-h-96 overflow-auto">
                {PLATFORM_GROUPS.map((group, gi) => (
                  <div key={group.label}>
                    {gi > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </DropdownMenuLabel>
                    </DropdownMenuGroup>
                    {group.items.map((item) => (
                      <DropdownMenuItem
                        key={item.value}
                        onClick={() => setPlatform(item.value)}
                        className="gap-2"
                      >
                        <PlatformIcon platform={item.value} size={14} />
                        <span className="flex-1">{item.label}</span>
                        {platform === item.value && (
                          <span className="text-xs text-muted-foreground">·</span>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !canSubmit} className="gap-1.5">
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {teamMode === "new" ? "Create team & project" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
