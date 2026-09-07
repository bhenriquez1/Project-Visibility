"use client";
import { useState } from "react";
import Link from "next/link";
import { prepareOwnerCommand, executeOwnerCommand } from "@/lib/actions/ownerCommandActions";
export function CommandPanel() {
  const [request, setRequest] = useState("");
  const [reply, setReply] = useState({ message: "", href: "", token: "" });
  const [busy, setBusy] = useState(false);
  return <div className="space-y-4"><form onSubmit={async e => {
    e.preventDefault(); setBusy(true); setReply({ message: "Preparing…", href: "", token: "" });
    try { setReply(await prepareOwnerCommand(request)); }
    catch (error) { setReply({ message: error instanceof Error ? error.message : "Request failed", href: "", token: "" }); }
    finally { setBusy(false); }
  }}><textarea aria-label="Your request" className="border rounded w-full p-3" maxLength={2000} required value={request} onChange={e => setRequest(e.target.value)} placeholder="Run Scout to find businesses, pause all automation, or show me pricing…" /><button disabled={busy} className="rounded bg-black text-white px-4 py-2">Ask Avrrio</button></form>
    <p role="status">{reply.message}</p>
    {reply.href && <Link className="underline" href={reply.href}>Open in Owner Command Center</Link>}
    {reply.token && <button disabled={busy} className="rounded border px-4 py-2" onClick={async () => {
      setBusy(true); const token = reply.token; setReply({ ...reply, token: "" });
      try { setReply({ message: await executeOwnerCommand(token), href: "/admin/agents", token: "" }); }
      catch (error) { setReply({ message: error instanceof Error ? error.message : "Action failed", href: "", token: "" }); }
      finally { setBusy(false); }
    }}>Approve and execute this action</button>}
  </div>;
}
