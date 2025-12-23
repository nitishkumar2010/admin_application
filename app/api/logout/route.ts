import { NextResponse } from "next/server";
import { clearAdminCookie } from "@/lib/auth";

export async function POST(req: Request) {
  await clearAdminCookie(); // IMPORTANT

  return NextResponse.redirect(new URL("/login", req.url));
}
