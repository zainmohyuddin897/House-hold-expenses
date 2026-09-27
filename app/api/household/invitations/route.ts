import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

async function actor(userId: string) {
  return db.householdMember.findFirst({ where: { userId } });
}

export async function GET() {
  try {
    const user = await requireUser();
    const member = await actor(user.id);
    if (!member) return NextResponse.json({ invitations: [] });
    const invitations = await db.householdInvitation.findMany({
      where: { householdId: member.householdId, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json({ invitations });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to load invitations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body.role === "string" ? body.role : "member";
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    if (!["admin", "member", "viewer"].includes(role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    const member = await actor(user.id);
    if (!member || !["owner", "admin"].includes(member.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const existing = await db.user.findUnique({ where: { email }, include: { householdMemberships: { where: { householdId: member.householdId } } } });
    if (existing?.householdMemberships.length) return NextResponse.json({ error: "User is already a household member." }, { status: 409 });
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.householdInvitation.updateMany({ where: { householdId: member.householdId, email, acceptedAt: null }, data: { expiresAt: new Date() } });
    const invitation = await db.householdInvitation.create({
      data: { householdId: member.householdId, inviterUserId: user.id, email, role, tokenHash: hash(token), expiresAt },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true }
    });
    await db.auditLog.create({ data: { userId: user.id, action: "INVITATION_CREATED", entity: "HouseholdInvitation", entityId: invitation.id, metadata: { email, role } } });
    return NextResponse.json({ invitation, token }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const { invitationId } = await request.json();
    const member = await actor(user.id);
    if (!member || !["owner", "admin"].includes(member.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const invitation = await db.householdInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation || invitation.householdId !== member.householdId) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    await db.householdInvitation.delete({ where: { id: invitationId } });
    await db.auditLog.create({ data: { userId: user.id, action: "INVITATION_REVOKED", entity: "HouseholdInvitation", entityId: invitationId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to revoke invitation" }, { status: 500 });
  }
}