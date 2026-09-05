export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { listRunnableAgents } from "@/lib/agents/runner";
import { runAgentAction, updateScoutMarketsAction } from "@/lib/actions/agentActions";
import type { AgentName } from "@/lib/agents/types";

const TIER_STYLES: Record<string, string> = {
  AUTOMATIC: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  AI_PREPARED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  BRIAN_ONLY: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default async function AgentsPage() {
  const agents = listRunnableAgents();
  const [runs, marketsSetting] = await Promise.all([
    prisma.agentRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
    prisma.setting.findUnique({ where: { key: "scout_target_markets" } }),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">Agents</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Manually triggered — no scheduler yet. Every action is either automatic (no external
        effect) or drafted for your approval; nothing sends or posts on its own.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className="flex items-center justify-between rounded-lg border border-black/10 p-4 dark:border-white/10"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize">{agent.name} agent</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_STYLES[agent.defaultControlTier]}`}>
                  {agent.defaultControlTier}
                </span>
              </div>
            </div>
            <form
              action={async () => {
                "use server";
                await runAgentAction(agent.name as AgentName);
              }}
            >
              <button className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
                Run now
              </button>
            </form>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Scout target markets
        </h2>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          JSON array, e.g. {`[{"category": "coffee shop", "city": "Austin, TX"}]`}
        </p>
        <form action={updateScoutMarketsAction} className="mt-3 flex flex-col gap-2">
          <textarea
            name="markets"
            defaultValue={marketsSetting?.value ?? "[]"}
            rows={4}
            className="w-full rounded-md border border-black/15 p-2 font-mono text-xs dark:border-white/20 dark:bg-black/20"
          />
          <button className="self-start rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
            Save markets
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">No agent runs yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/50 dark:border-white/10 dark:text-white/50">
                  <th className="py-2 pr-4">Agent</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Actions</th>
                  <th className="py-2 pr-4">Started</th>
                  <th className="py-2 pr-4">Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-4 capitalize">{run.agentName}</td>
                    <td className="py-2 pr-4">{run.status}</td>
                    <td className="py-2 pr-4">{run.actionsProposed}</td>
                    <td className="py-2 pr-4">{run.startedAt.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-red-600 dark:text-red-400">{run.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
