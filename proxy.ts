import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authDisabled, isAdminApi, isAdminEmail, isAdminPath, isAllowedEmail, isOpenPath } from "@/lib/auth/policy";

/**
 * The sign-in gate (Next 16's request proxy, formerly middleware). Share links and the GET APIs
 * they read stay open; everything else needs a signed-in account on the allowed domain, and the
 * admin pages/APIs need an admin. Pages redirect to /signin; APIs get JSON 401/403.
 */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const method = req.method;
  const isApi = pathname.startsWith("/api/");

  if (authDisabled()) return NextResponse.next();
  if (isOpenPath(pathname, method, search)) return NextResponse.next();

  const email = req.auth?.user?.email ?? null;
  if (!email || !isAllowedEmail(email)) {
    if (isApi) {
      return NextResponse.json({ error: "Sign in required", code: "unauthenticated" }, { status: 401 });
    }
    const signin = new URL("/signin", req.nextUrl);
    signin.searchParams.set("callbackUrl", pathname + search);
    if (email) signin.searchParams.set("error", "AccessDenied");
    return NextResponse.redirect(signin);
  }

  const needsAdmin = isApi ? isAdminApi(pathname, method) : isAdminPath(pathname);
  if (needsAdmin && !isAdminEmail(email)) {
    if (isApi) return NextResponse.json({ error: "Admin access required", code: "forbidden" }, { status: 403 });
    const signin = new URL("/signin", req.nextUrl);
    signin.searchParams.set("error", "NotAdmin");
    return NextResponse.redirect(signin);
  }

  return NextResponse.next();
});

export const config = {
  // Everything except Next's own assets and the brand images. Open pages are let through above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
