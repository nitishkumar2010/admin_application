import { cookies } from "next/headers";

const ADMIN_USER = "admin";
const ADMIN_PASS = "admin";

export function validateLogin(username: string, password: string) {
  return username === ADMIN_USER && password === ADMIN_PASS;
}

export async function setAdminCookie() {
  const cookieStore = await cookies();
  cookieStore.set("isAdmin", "true", {
    httpOnly: true,
    path: "/",
  });
}

export async function isAdmin() {
  const cookieStore = await cookies();
  return cookieStore.get("isAdmin")?.value === "true";
}

export async function clearAdminCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("isAdmin");
}

