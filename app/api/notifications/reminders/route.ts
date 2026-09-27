import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function POST() {
  try {
    const user = await requireUser();
    const now = new Date();
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const bills = await db.bill.findMany({ where: { userId: user.id, paid: false, dueDate: { lte: horizon } } });
    const subscriptions = await db.subscription.findMany({ where: { userId: user.id, active: true, nextBillingDate: { lte: horizon } } });
    const created: string[] = [];
    for (const bill of bills) {
      const due = bill.dueDate < now ? "overdue" : "due soon";
      const existing = await db.notification.findFirst({ where: { userId: user.id, title: "Bill reminder", message: { contains: bill.id } }, orderBy: { createdAt: "desc" } });
      if (!existing || existing.createdAt < new Date(now.getTime() - 24 * 60 * 60 * 1000)) {
        const n = await db.notification.create({ data: { userId: user.id, title: "Bill reminder", message: `${bill.name} is ${due}. Amount: ${bill.amount} ${bill.id}` } });
        created.push(n.id);
      }
    }
    for (const sub of subscriptions) {
      const existing = await db.notification.findFirst({ where: { userId: user.id, title: "Subscription reminder", message: { contains: sub.id } }, orderBy: { createdAt: "desc" } });
      if (!existing || existing.createdAt < new Date(now.getTime() - 24 * 60 * 60 * 1000)) {
        const n = await db.notification.create({ data: { userId: user.id, title: "Subscription reminder", message: `${sub.name} bills soon. Amount: ${sub.amount} ${sub.id}` } });
        created.push(n.id);
      }
    }
    return NextResponse.json({ created: created.length });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to generate reminders" }, { status: 500 });
  }
}