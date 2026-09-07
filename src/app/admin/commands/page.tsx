import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { CommandPanel } from "./command-panel";
export default async function CommandsPage() {
  if ((await auth())?.user?.role !== "owner") notFound();
  return <div className="max-w-2xl"><h1 className="text-2xl font-semibold">Talk to Avrrio</h1><p className="my-4">Ask to run an agent, pause automation, or open pricing, customers, and approvals. Review the exact action before execution.</p><CommandPanel /></div>;
}
