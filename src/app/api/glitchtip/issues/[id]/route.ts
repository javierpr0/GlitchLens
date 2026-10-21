import { api } from "@/lib/glitchtip/api";
import { guardRequest } from "@/lib/bff-guard";
import { errorResponse } from "@/lib/route-utils";
import { NextResponse } from "next/server";
import { z } from "zod";

const ID = /^\d+$/;

const UpdateIssueSchema = z.object({
  status: z.enum(["unresolved", "resolved", "ignored", "reprocessing"]).optional(),
  assignedTo: z.string().nullable().optional(),
  isSubscribed: z.boolean().optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await guardRequest(req, { write: true });
  if (guard.response) return guard.response;

  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const parsed = UpdateIssueSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  try {
    const updated = await api.updateIssue(id, parsed.data);
    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await guardRequest(req, { write: true });
  if (guard.response) return guard.response;

  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  try {
    await api.deleteIssue(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
