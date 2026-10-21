"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function CreateTeam({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const value = slug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!value) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/glitchtip/organizations/${orgSlug}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: value }),
      });
      if (!res.ok) throw new Error();
      toast.success("Team created.");
      setOpen(false);
      setSlug("");
      router.refresh();
    } catch {
      toast.error("Could not create team.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
        <Plus className="h-3.5 w-3.5" /> New team
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a team</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="team-slug">Team slug</Label>
          <Input
            id="team-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="frontend"
            className="bg-background"
          />
          <p className="text-[11px] text-muted-foreground">
            Lowercase letters, numbers and hyphens only.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !slug.trim()} className="gap-1.5">
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
