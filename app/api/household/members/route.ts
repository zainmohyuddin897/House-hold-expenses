import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

async function getMembership(userId: string, householdId?: string) {
  return db.householdMember.findFirst({ where: { userId, ...(householdId ? { householdId } : {}) } });
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    const role = typeof body.role === "string" ? body.role : "";
    if (!memberId || !["admin", "member", "viewer"].includes(role)) return NextResponse.json({ error: "Invalid member or role." }, { status: 400 });
    const target = await db.householdMember.findUnique({ where: { id: memberId } });
    if (!target) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    const actor = await getMembership(user.id, target.householdId);
    if (!actor || actor.role !== "owner") return NextResponse.json({ error: "Only the owner can change roles." }, { status: 403 });
    if (target.role === "owner") return NextResponse.json({ error: "The owner role cannot be changed here." }, { status: 400 });
    const updated = await db.householdMember.update({ where: { id: memberId }, data: { role } });
    await db.auditLog.create({ data: { userId: user.id, action: "MEMBER_ROLE_UPDATED", entity: "HouseholdMember", entityId: memberId, metadata: { role } } });
    return NextResponse.json({ member: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error(error);
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    const target = await db.householdMember.findUnique({ where: { id: memberId } });
    if (!target) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    const actor = await getMembership(user.id, target.householdId);
    if (!actor || !["owner", "admin"].includes(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (target.role === "owner") return NextResponse.json({ error: "The household owner cannot be removed." }, { status: 400 });
    await db.householdMember.delete({ where: { id: memberId } });
    await db.auditLog.create({ data: { userId: user.id, action: "MEMBER_REMOVED", entity: "HouseholdMember", entityId: memberId, metadata: { removedUserId: target.userId } } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error(error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
