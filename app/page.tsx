import { redirect } from "next/navigation";
import DashboardClient from "@/components/DashboardClient";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <DashboardClient user={{ name: user.name, email: user.email }} />;
}