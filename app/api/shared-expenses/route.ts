import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

async function member(userId: string, householdId?: string) {
  return db.householdMember.findFirst({ where: { userId, ...(householdId ? { householdId } : {}) } });
}
const money = (n: unknown) => {
  const value = Number(n);
  return Number.isFinite(value) && value > 0 ? value : null;
};

export async function GET() {
  try {
    const user = await requireUser();
    const m = await member(user.id);
    if (!m) return NextResponse.json({ expenses: [] });
    const expenses = await db.sharedExpense.findMany({
      where: { householdId: m.householdId },
      include: { payer: { select: { id: true, name: true, email: true } }, participants: { include: { user: { select: { id: true, name: true, email: true } } } } },
      orderBy: { date: "desc" }
    });
    return NextResponse.json({ expenses });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to load shared expenses" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const amount = money(body.amount);
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const currency = typeof body.currency === "string" ? body.currency : "PKR";
    const date = new Date(body.date ?? Date.now());
    const participants = Array.isArray(body.participants) ? body.participants : [];
    if (!amount || !description || description.length > 200 || Number.isNaN(date.getTime()) || participants.length === 0) return NextResponse.json({ error: "Invalid expense data." }, { status: 400 });
    const payer = await member(user.id);
    if (!payer) return NextResponse.json({ error: "You are not in a household." }, { status: 403 });
    const ids = participants.map((p: any) => p.userId);
    if (new Set(ids).size !== ids.length || !ids.includes(user.id)) return NextResponse.json({ error: "Participants must be unique and include the payer." }, { status: 400 });
    const members = await db.householdMember.findMany({ where: { householdId: payer.householdId, userId: { in: ids } } });
    if (members.length !== ids.length) return NextResponse.json({ error: "Every participant must belong to the household." }, { status: 400 });
    const shares = participants.map((p: any) => ({ userId: p.userId, shareAmount: Number(p.shareAmount) }));
    if (shares.some((p: any) => !Number.isFinite(p.shareAmount) || p.shareAmount < 0) || Math.abs(shares.reduce((s: number,p: any)=>s+p.shareAmount,0)-amount) > 0.005) return NextResponse.json({ error: "Participant shares must equal the expense amount." }, { status: 400 });
    const expense = await db.sharedExpense.create({ data: { householdId: payer.householdId, payerUserId: user.id, description, amount, currency, date, participants: { create: shares } }, include: { participants: true } });
    await db.auditLog.create({ data: { userId: user.id, action: "SHARED_EXPENSE_CREATED", entity: "SharedExpense", entityId: expense.id, metadata: { amount, participants: ids } } });
    return NextResponse.json({ expense }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to create shared expense" }, { status: 500 });
  }
}