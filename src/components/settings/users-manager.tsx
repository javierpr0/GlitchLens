"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { relativeTime } from "@/lib/format";
import type { Instance } from "@/lib/instances";
import type { Role, UserSummary } from "@/lib/users";
import { Loader2, Pencil, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const ROLE_HELP: Record<Role, string> = {
  superadmin: "Manages users and instances, full access everywhere.",
  member: "Works with issues, alerts and projects on assigned instances.",
  viewer: "Read-only access to assigned instances.",
};

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function UsersManager({
  users,
  instances,
  currentUserId,
}: {
  users: UserSummary[];
  instances: Instance[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [active, setActive] = useState(true);
  const [instanceIds, setInstanceIds] = useState<number[]>([]);
  const [resetTwoFactor, setResetTwoFactor] = useState(false);
  const [saving, setSaving] = useState(false);

  function openFor(user: UserSummary | null) {
    setEditing(user);
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setPassword("");
    setRole(user?.role ?? "member");
    setActive(user?.active ?? true);
    setInstanceIds(user?.instanceIds ?? []);
    setResetTwoFactor(false);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    const payload = {
      name: name.trim(),
      email: email.trim(),
      role,
      instanceIds: role === "superadmin" ? [] : instanceIds,
      ...(password ? { password } : {}),
      ...(editing ? { active } : {}),
      ...(editing && resetTwoFactor ? { resetTwoFactor: true as const } : {}),
    };
    const res = await fetch(editing ? `/api/admin/users/${editing.id}` : "/api/admin/users", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? "Could not save the user.");
      return;
    }
    toast.success(editing ? "User updated." : "User created.");
    setOpen(false);
    router.refresh();
  }

  async function remove(u: UserSummary) {
    if (!confirm(`Delete ${u.name} (${u.email})? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return toast.error(data.error ?? "Could not delete the user.");
    }
    toast.success("User deleted.");
    router.refresh();
  }

  function toggleInstance(id: number, on: boolean) {
    setInstanceIds((cur) => (on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id)));
  }

  const canSave = name.trim() && email.trim() && (editing || password.length >= 10);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => openFor(null)}>
          <UserPlus className="h-3.5 w-3.5" /> Add user
        </Button>
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{u.name}</span>
                <Badge variant="outline" className="text-[10px] capitalize">{u.role}</Badge>
                {!u.active && <Badge variant="outline" className="text-[10px] text-amber-400">Disabled</Badge>}
                {u.twoFactor && <Badge variant="outline" className="text-[10px] text-emerald-400">2FA</Badge>}
                {u.id === currentUserId && <Badge variant="outline" className="text-[10px]">You</Badge>}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {u.email} ·{" "}
                {u.role === "superadmin"
                  ? "all instances"
                  : `${u.instanceIds.length} instance${u.instanceIds.length === 1 ? "" : "s"}`}{" "}
                · {u.lastLoginAt ? `last seen ${relativeTime(new Date(u.lastLoginAt).toISOString())}` : "never signed in"}
              </div>
            </div>
            <Button variant="ghost" size="icon" aria-label={`Edit ${u.name}`} onClick={() => openFor(u)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${u.name}`}
              disabled={u.id === currentUserId}
              onClick={() => remove(u)}
            >
              <Trash2 className="h-4 w-4 text-red-400" />
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit user" : "Add a user"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Changing the password signs the user out everywhere."
                : "Share the password with them over a secure channel. They can change it after signing in."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="user-name">Name</Label>
              <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">{editing ? "New password (optional)" : "Password"}</Label>
              <Input
                id="user-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 10 characters"
                maxLength={128}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-role">Role</Label>
              <select id="user-role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={selectClass}>
                <option value="superadmin">Superadmin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
              <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
            </div>
            {role !== "superadmin" && (
              <div className="space-y-2">
                <Label>Instances</Label>
                {instances.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Add an instance first, then assign it here.</p>
                ) : (
                  <div className="space-y-1.5 rounded-lg border border-border p-3">
                    {instances.map((i) => (
                      <label key={i.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox checked={instanceIds.includes(i.id)} onCheckedChange={(v) => toggleInstance(i.id, !!v)} />
                        <span className="truncate">{i.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            {editing?.twoFactor && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={resetTwoFactor} onCheckedChange={(v) => setResetTwoFactor(!!v)} />
                Reset two-factor (lost device) and sign the user out
              </label>
            )}
            {editing && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={active} onCheckedChange={(v) => setActive(!!v)} disabled={editing.id === currentUserId} />
                Account enabled
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !canSave}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {editing ? "Save" : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
