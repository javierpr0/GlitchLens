import { NextResponse } from "next/server";
import { z } from "zod";
import { guardRequest } from "@/lib/bff-guard";
import { hashPassword } from "@/lib/crypto";
import { errorResponse, readJson } from "@/lib/route-utils";
import { PASSWORD_MAX, PASSWORD_MIN, ROLES, createUser } from "@/lib/users";

const Body = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
  role: z.enum(ROLES as [string, ...string[]]),
  instanceIds: z.array(z.number().int().positive()).max(500).default([]),
});

export async function POST(req: Request) {
  const guard = await guardRequest(req, { superadmin: true });
  if (guard.response) return guard.response;
  const parsed = await readJson(req, Body);
  if (parsed.response) return parsed.response;
  const { password, role, ...rest } = parsed.data;

  try {
    const id = createUser({
      ...rest,
      role: role as (typeof ROLES)[number],
      passwordHash: await hashPassword(password),
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
