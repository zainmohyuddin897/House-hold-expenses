import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { participantId, settled } = await request.json();
    if (typeof participantId !== "string" || typeof settled !== "boolean") return NextResponse.json({ error: "Invalid settlement data." }, { status: 400 });
    const participant = await db.sharedExpenseParticipant.findUnique({ where: { id: participantId }, include: { sharedExpense: true } });
    if (!participant) return NextResponse.json({ error: "Participant record not found." }, { status: 404 });
    const actor = await db.householdMember.findFirst({ where: { user.id, householdId: participant.sharedExpense.householdId } });
    if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (participant.user.id !== user.id && !["owner", "admin"].includes(actor.role)) return NextResponse.json({ error: "Only the participant or household admin can update settlement." }, { status: 403 });
    const updated = await db.sharedExpenseParticipant.update({ where: { id: participantId }, data: { settled } });
    await db.auditLog.create({ data: { user.id, action: settled ? "SHARED_EXPENSE_SETTLED" : "SHARED_EXPENSE_UNSETTLED", entity: "SharedExpenseParticipant", entityId: participantId, metadata: { settled } } });
    return NextResponse.json({ participant: updated });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to update settlement" }, { status: 500 });
  }
}