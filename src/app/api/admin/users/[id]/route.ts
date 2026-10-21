import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { guardRequest } from "@/lib/bff-guard";
import { hashPassword } from "@/lib/crypto";
import { resetTwoFactor as resetTwoFactorFor } from "@/lib/twofactor";
import { errorResponse, jsonError, readJson } from "@/lib/route-utils";
import { PASSWORD_MAX, PASSWORD_MIN, ROLES, deleteUser, updateUser, type Role } from "@/lib/users";

const Body = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.email().max(254).optional(),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX).optional(),
  role: z.enum(ROLES as [string, ...string[]]).optional(),
  active: z.boolean().optional(),
  instanceIds: z.array(z.number().int().positive()).max(500).optional(),
  resetTwoFactor: z.literal(true).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

async function parseId(ctx: Ctx): Promise<number | null> {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const guard = await guardRequest(req, { superadmin: true });
  if (guard.response) return guard.response;
  const id = await parseId(ctx);
  if (!id) return jsonError("Invalid id", 400);
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;
  const { password, role, resetTwoFactor, ...rest } = parsed.data;
  // Your own 2FA is turned off from Settings > Account, which asks for the password and a code.
  if (resetTwoFactor && id === guard.user.id) {
    return jsonError("Turn off your own two-factor in Settings > Account.", 400);
  }

  try {
    const email = updateUser(
      id,
      {
        ...rest,
        role: role as Role | undefined,
        passwordHash: password ? await hashPassword(password) : undefined,
      },
      guard.user.id,
    );
    // After the update succeeded, so a rejected change (for example the last-superadmin guard) leaves 2FA alone.
    if (resetTwoFactor) resetTwoFactorFor(id);
    recordAudit({
      actor: guard.user,
      action: password ? "user.password_reset" : "user.update",
      target: email,
      // Field names and non-secret values only.
      detail: { fields: Object.keys(parsed.data).filter((k) => k !== "password"), role, active: rest.active },
      headers: req.headers,
    });
    if (resetTwoFactor) recordAudit({ actor: guard.user, action: "2fa.reset", target: email, headers: req.headers });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const guard = await guardRequest(req, { superadmin: true });
  if (guard.response) return guard.response;
  const id = await parseId(ctx);
  if (!id) return jsonError("Invalid id", 400);
  try {
    const email = deleteUser(id, guard.user.id);
    recordAudit({ actor: guard.user, action: "user.delete", target: email, headers: req.headers });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
