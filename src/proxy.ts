import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "glitchlens_session";
const PUBLIC_PAGES = ["/login", "/setup"];
const PUBLIC_API = ["/api/setup", "/api/auth/login", "/api/auth/login/2fa", "/api/auth/logout", "/api/health"];

/**
 * Content-Security-Policy with a per-request nonce. Scripts are the part that stops XSS: only
 * the nonce'd framework scripts (and what they load) run, so injected markup cannot execute.
 * Styles keep 'unsafe-inline' because the UI libraries (charts, toasts, popovers) set inline
 * styles at runtime; that cannot run code. No upgrade-insecure-requests: it would break plain-HTTP LAN installs.
 */
function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Pass the request on with a fresh CSP. Next reads the nonce from the request header and stamps its own scripts. */
function next(req: NextRequest): NextResponse {
  const isPrefetch = req.headers.has("next-router-prefetch") || req.headers.get("purpose") === "prefetch";
  if (req.nextUrl.pathname.startsWith("/api/") || isPrefetch) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

/**
 * First gate only: it checks the cookie exists. Whether the session is valid
 * (and what the user may do) is decided on the server in the layouts and in
 * every route handler, which is where it actually has to be enforced.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PAGES.includes(pathname) || PUBLIC_API.includes(pathname)) return next(req);
  if (req.cookies.has(SESSION_COOKIE)) return next(req);

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
