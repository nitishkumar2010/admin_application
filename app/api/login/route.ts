import { NextResponse } from "next/server";
import { validateLogin, setAdminCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const { username, password } = await req.json();

  if (validateLogin(username, password)) {
    await setAdminCookie();   // <-- IMPORTANT!
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid" }, { status: 401 });
}
