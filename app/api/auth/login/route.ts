import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/prisma";
import { createSession, publicUser } from "@/lib/auth";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});

export async function POST(req: Request) {
  const limit = rateLimit(`login:${getClientIp(req)}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
  const accountLimit = rateLimit(`login-account:${parsed.data.email}`, 8, 15 * 60 * 1000);
  if (!accountLimit.allowed) return rateLimitResponse(accountLimit.retryAfter);

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await createSession(user.id);
  await db.auditLog.create({ data: { userId: user.id, action: "LOGIN", entity: "Session", metadata: { method: "password" } } });
  return NextResponse.json({ ok: true, user: publicUser(user) });
}
