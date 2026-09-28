import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/prisma";
import { createSession, publicUser } from "@/lib/auth";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160).transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const limit = rateLimit(`register:${getClientIp(req)}`, 5, 15 * 60 * 1000);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid registration details.", details: parsed.error.flatten() }, { status: 400 });

  const { name, email, password } = parsed.data;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { name, email, passwordHash } });
    const household = await tx.household.create({ data: { name: name + "'s Household" } });
    await tx.householdMember.create({ data: { userId: created.id, householdId: household.id, role: "owner" } });
    await tx.account.create({ data: { userId: created.id, householdId: household.id, name: "Cash", type: "cash", currency: "PKR" } });

    const categories = [
      ["Salary", "income"], ["Other Income", "income"],
      ["Housing", "expense"], ["Groceries", "expense"], ["Utilities", "expense"],
      ["Transport", "expense"], ["Education", "expense"], ["Healthcare", "expense"],
      ["Entertainment", "expense"], ["Shopping", "expense"], ["Other", "expense"],
    ];
    await tx.category.createMany({
      data: categories.map(([categoryName, type]) => ({ userId: created.id, name: categoryName, type })),
    });
    return created;
  });

  await createSession(user.id);
  await db.auditLog.create({ data: { userId: user.id, action: "REGISTER", entity: "User", entityId: user.id } });
  return NextResponse.json({ ok: true, user: publicUser(user) }, { status: 201 });
}
