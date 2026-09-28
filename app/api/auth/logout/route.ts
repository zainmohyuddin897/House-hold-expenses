import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/prisma";

export async function POST() {
  const user = await getCurrentUser();
  if (user) {
    await db.auditLog.create({ data: { userId: user.id, action: "LOGOUT", entity: "Session" } }).catch(() => undefined);
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
