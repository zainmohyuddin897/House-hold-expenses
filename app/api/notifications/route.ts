import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const notifications = await db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    const unread = notifications.filter(n => !n.read).length;
    return NextResponse.json({ notifications, unread });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    if (body.markAllRead === true) {
      await db.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
      return NextResponse.json({ success: true });
    }
    if (typeof body.id !== "string") return NextResponse.json({ error: "Notification id is required." }, { status: 400 });
    const notification = await db.notification.updateMany({ where: { id: body.id, userId: user.id }, data: { read: true } });
    if (!notification.count) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}