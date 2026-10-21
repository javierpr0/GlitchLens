"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Team } from "@/lib/glitchtip/types";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

export function TeamsGrid({ orgSlug, teams }: { orgSlug: string; teams: Team[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function destroy(slug: string) {
    if (!confirm(`Delete team "${slug}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/glitchtip/teams/${orgSlug}/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete team.");
        return;
      }
      toast.success(`Team #${slug} deleted.`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {teams.map((t) => (
        <Card key={t.id}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm">#{t.slug}</CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" disabled={pending} />}
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => destroy(t.slug)}
                  className="gap-2 text-red-400 focus:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete team
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div>{t.memberCount} member{t.memberCount === 1 ? "" : "s"}</div>
            <div>{t.projects.length} project{t.projects.length === 1 ? "" : "s"}</div>
            {t.projects.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {t.projects.slice(0, 6).map((p) => (
                  <Badge key={p.id} variant="outline" className="text-[10px]">
                    {p.name}
                  </Badge>
                ))}
                {t.projects.length > 6 && (
                  <Badge variant="outline" className="text-[10px]">+{t.projects.length - 6}</Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
