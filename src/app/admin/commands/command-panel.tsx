"use client";
import { useState } from "react";
import Link from "next/link";
import { prepareOwnerCommand, executeOwnerCommand } from "@/lib/actions/ownerCommandActions";

type CommandPreview = { affectedRecords: number | null; limit: number | null; consequence: string };
type CommandReply = { message: string; href: string; token: string; preview?: CommandPreview | null };

const EMPTY_REPLY: CommandReply = { message: "", href: "", token: "", preview: null };

export function CommandPanel() {
  const [request, setRequest] = useState("");
  const [reply, setReply] = useState<CommandReply>(EMPTY_REPLY);
  const [busy, setBusy] = useState(false);
  return <div className="space-y-4"><form onSubmit={async e => {
    e.preventDefault(); setBusy(true); setReply({ ...EMPTY_REPLY, message: "Preparing…" });
    try { setReply(await prepareOwnerCommand(request)); }
    catch (error) { setReply({ ...EMPTY_REPLY, message: error instanceof Error ? error.message : "Request failed" }); }
    finally { setBusy(false); }
  }}><textarea aria-label="Your request" className="border rounded w-full p-3" maxLength={2000} required value={request} onChange={e => setRequest(e.target.value)} placeholder="Find 10 businesses in Austin, TX, audit new prospects, show replies needing attention, or pause the sales agent…" /><button disabled={busy} className="rounded bg-black text-white px-4 py-2">Ask Avrrio</button></form>
    <p role="status">{reply.message}</p>
    {reply.preview && <dl className="rounded border p-3 text-sm space-y-1">
      {reply.preview.affectedRecords !== null && <div><dt className="inline font-medium">Affected records: </dt><dd className="inline">{reply.preview.affectedRecords}</dd></div>}
      {reply.preview.limit !== null && <div><dt className="inline font-medium">Configured limit: </dt><dd className="inline">{reply.preview.limit}</dd></div>}
      <div><dt className="inline font-medium">What this does: </dt><dd className="inline">{reply.preview.consequence}</dd></div>
    </dl>}
    {reply.href && <Link className="underline" href={reply.href}>Open in Owner Command Center</Link>}
    {reply.token && <button disabled={busy} className="rounded border px-4 py-2" onClick={async () => {
      setBusy(true); const token = reply.token; setReply({ ...reply, token: "" });
      try { setReply({ message: await executeOwnerCommand(token), href: "/admin/agents", token: "", preview: null }); }
      catch (error) { setReply({ message: error instanceof Error ? error.message : "Action failed", href: "", token: "", preview: null }); }
      finally { setBusy(false); }
    }}>Approve and execute this action</button>}
  </div>;
}
