import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "glitchlens_session";
const PUBLIC_PAGES = ["/login", "/setup"];
const PUBLIC_API = ["/api/setup", "/api/auth/login", "/api/auth/login/2fa", "/api/auth/logout", "/api/health"];

/**
 * First gate only: it checks the cookie exists. Whether the session is valid
 * (and what the user may do) is decided on the server in the layouts and in
 * every route handler, which is where it actually has to be enforced.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PAGES.includes(pathname) || PUBLIC_API.includes(pathname)) return NextResponse.next();
  if (req.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.svg|.*\\.png).*)",
  ],
};
