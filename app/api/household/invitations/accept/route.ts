import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { token } = await request.json();
    if (typeof token !== "string" || !token) return NextResponse.json({ error: "Invitation token is required." }, { status: 400 });
    const invitation = await db.householdInvitation.findUnique({ where: { tokenHash: hash(token) } });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) return NextResponse.json({ error: "Invitation is invalid or expired." }, { status: 400 });
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) return NextResponse.json({ error: "This invitation belongs to a different email address." }, { status: 403 });
    await db.$transaction(async tx => {
      const existing = await tx.householdMember.findUnique({ where: { userId_householdId: { userId: user.id, householdId: invitation.householdId } } });
      if (!existing) await tx.householdMember.create({ data: { userId: user.id, householdId: invitation.householdId, role: invitation.role } });
      await tx.householdInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
      await tx.auditLog.create({ data: { userId: user.id, action: "INVITATION_ACCEPTED", entity: "HouseholdInvitation", entityId: invitation.id, metadata: { householdId: invitation.householdId } } });
    });
    return NextResponse.json({ success: true, householdId: invitation.householdId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
  }
}