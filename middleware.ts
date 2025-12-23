import { NextResponse } from "next/server";

export function middleware(req: Request) {
  const url = new URL(req.url);
  const isAdmin = req.headers.get("cookie")?.includes("isAdmin=true");

  if (url.pathname.startsWith("/admin")) {
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
