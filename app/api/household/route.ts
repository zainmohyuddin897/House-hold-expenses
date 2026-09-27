import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

async function membership(userId: string) {
  return db.householdMember.findFirst({ where: { userId }, include: { household: true } });
}

export async function GET() {
  try {
    const user = await requireUser();
    const member = await membership(user.id);
    if (!member) return NextResponse.json({ household: null, members: [] });
    const members = await db.householdMember.findMany({
      where: { householdId: member.householdId },
      include: { user: { select: { id: true, name: true, email: true, emailVerifiedAt: true } } },
      orderBy: { joinedAt: "asc" },
    });
    return NextResponse.json({
      household: member.household,
      role: member.role,
      members: members.map(m => ({ id: m.id, role: m.role, joinedAt: m.joinedAt, user: m.user })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error(error);
    return NextResponse.json({ error: "Failed to load household" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 80) return NextResponse.json({ error: "Household name must be 2-80 characters." }, { status: 400 });
    const member = await membership(user.id);
    if (!member || !["owner", "admin"].includes(member.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const household = await db.household.update({ where: { id: member.householdId }, data: { name } });
    await db.auditLog.create({ data: { userId: user.id, action: "HOUSEHOLD_UPDATED", entity: "Household", entityId: household.id, metadata: { name } } });
    return NextResponse.json({ household });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error(error);
    return NextResponse.json({ error: "Failed to update household" }, { status: 500 });
  }
}
