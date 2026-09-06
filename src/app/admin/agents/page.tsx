export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { listRunnableAgents } from "@/lib/agents/runner";
import { isGlobalAutomationPaused, isAgentPaused } from "@/lib/automationPause";
import {
  runAgentAction,
  setAgentPauseAction,
  setGlobalPauseAction,
  updateScoutMarketsAction,
} from "@/lib/actions/agentActions";
import { AGENT_NAMES, getAgentOperatingState } from "@/lib/agentOperations";

const TIER_STYLES: Record<string, string> = {
  AUTONOMOUS: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  APPROVAL_REQUIRED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  PAUSED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  DEGRADED: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  ERROR: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default async function AgentsPage() {
  const implemented = listRunnableAgents();
  const implementedByName = new Map(implemented.map((a) => [a.name, a]));

  const [runs, marketsSetting, globalPaused, perAgentPaused] = await Promise.all([
    prisma.agentRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
    prisma.setting.findUnique({ where: { key: "scout_target_markets" } }),
    isGlobalAutomationPaused(),
    Promise.all(AGENT_NAMES.map(async (name) => [name, await isAgentPaused(name)] as const)),
  ]);
  const pausedByName = new Map(perAgentPaused);
  const operatingStates = new Map(
    await Promise.all(AGENT_NAMES.map(async (name) => [name, await getAgentOperatingState(name)] as const))
  );

  const lastRunByAgent = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!lastRunByAgent.has(run.agentName)) lastRunByAgent.set(run.agentName, run);
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">Agents</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Brian Control Layer enforced: agents may analyze, create reversible internal records,
        and prepare drafts. Financial, contractual, destructive, external communication, and
        account-ownership actions are blocked from autonomous execution.
      </p>

      <section
        className={`mt-6 flex items-center justify-between rounded-lg border p-4 text-sm ${
          globalPaused
            ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
            : "border-black/10 dark:border-white/10"
        }`}
      >
        <div>
          <div className="font-medium">Global automation pause</div>
          <div className="text-xs text-black/50 dark:text-white/50">
            {globalPaused
              ? "PAUSED — no agent can run, no message/review reply can be sent or posted."
              : "Running normally."}
          </div>
        </div>
        <form
          action={async () => {
            "use server";
            await setGlobalPauseAction(!globalPaused);
          }}
        >
          <button
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              globalPaused
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "border border-red-300 text-red-700 dark:border-red-700 dark:text-red-400"
            }`}
          >
            {globalPaused ? "Resume automation" : "Pause everything"}
          </button>
        </form>
      </section>

      <div className="mt-6 flex flex-col gap-3">
        {AGENT_NAMES.map((name) => {
          const agent = implementedByName.get(name);
          const lastRun = lastRunByAgent.get(name);
          const paused = pausedByName.get(name) ?? false;
          const operatingState = operatingStates.get(name) ?? "DEGRADED";

          return (
            <div
              key={name}
              className="flex items-center justify-between rounded-lg border border-black/10 p-4 dark:border-white/10"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">{name} agent</span>
                  {agent ? (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_STYLES[operatingState]}`}>
                      {operatingState.replace("_", " ")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold text-black/50 dark:bg-white/10 dark:text-white/50">
                      not implemented
                    </span>
                  )}
                  {paused && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-300">
                      paused
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-black/50 dark:text-white/50">
                  {lastRun
                    ? `Last run: ${lastRun.status.toLowerCase()} · ${lastRun.actionsProposed} action${lastRun.actionsProposed === 1 ? "" : "s"} · ${lastRun.startedAt.toLocaleString()}`
                    : agent
                      ? "Never run."
                      : "No implementation to run yet — see ROADMAP.md."}
                </div>
              </div>
              {agent && (
                <div className="flex gap-2">
                  <form
                    action={async () => {
                      "use server";
                      await setAgentPauseAction(name, !paused);
                    }}
                  >
                    <button className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
                      {paused ? "Unpause" : "Pause"}
                    </button>
                  </form>
                  <form
                    action={async () => {
                      "use server";
                      await runAgentAction(name);
                    }}
                  >
                    <button className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
                      Run now
                    </button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
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
