import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/bff-guard";
import { getActiveOrgSlug } from "@/lib/org";
import { errorResponse } from "@/lib/route-utils";

export async function GET(req: Request) {
  const guard = await guardRequest(req);
  if (guard.response) return guard.response;
  try {
    return NextResponse.json({ slug: await getActiveOrgSlug() });
  } catch (e) {
    return errorResponse(e);
  }
}
