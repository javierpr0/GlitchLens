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
import { DsnCard } from "@/components/projects/dsn-card";
import type { ProjectKey } from "@/lib/glitchtip/types";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export function KeysManager({
  orgSlug,
  projectSlug,
  keys,
}: {
  orgSlug: string;
  projectSlug: string;
  keys: ProjectKey[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  async function create() {
    setCreating(true);
    try {
      const res = await fetch(`/api/glitchtip/projects/${orgSlug}/${projectSlug}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      toast.success("Key created.");
      setOpen(false);
      setName("");
      router.refresh();
    } catch {
      toast.error("Could not create key.");
    } finally {
      setCreating(false);
    }
  }

  function destroy(id: string) {
    if (!confirm("Revoke this key? Apps using it will stop sending events.")) return;
    startTransition(async () => {
      const res = await fetch(`/api/glitchtip/projects/${orgSlug}/${projectSlug}/keys/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Could not revoke key.");
        return;
      }
      toast.success("Key revoked.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No keys configured.</p>
      ) : (
        keys.map((k) => (
          <div key={k.id} className="space-y-2">
            <DsnCard clientKey={k} />
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => destroy(k.id)}
                disabled={pending}
                className="gap-1.5 text-red-400"
              >
                <Trash2 className="h-3 w-3" /> Revoke
              </Button>
            </div>
          </div>
        ))
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
          <Plus className="h-3.5 w-3.5" /> New key
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new client key</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="key-name">Name (optional)</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production"
              className="bg-background"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={creating} className="gap-1.5">
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
