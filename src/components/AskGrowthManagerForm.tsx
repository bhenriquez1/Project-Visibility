"use client";

import { useActionState } from "react";
import { askGrowthManagerAction } from "@/lib/actions/customerActions";

interface State {
  question: string | null;
  answer: string | null;
  error: string | null;
}

async function submit(_prevState: State, formData: FormData): Promise<State> {
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { question: null, answer: null, error: null };

  try {
    const answer = await askGrowthManagerAction(question);
    return { question, answer, error: null };
  } catch (err) {
    return { question, answer: null, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export function AskGrowthManagerForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(submit, {
    question: null,
    answer: null,
    error: null,
  });

  return (
    <div>
      <form action={formAction} className="flex flex-col gap-2">
        <textarea
          name="question"
          placeholder="e.g. Why did my visibility score change?"
          rows={3}
          required
          className="w-full rounded-md border border-black/15 p-2 text-sm dark:border-white/20 dark:bg-black/20"
        />
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending ? "Thinking…" : "Ask"}
        </button>
      </form>

      {state.error && <p className="mt-4 text-sm text-red-600">{state.error}</p>}

      {state.answer && (
        <div className="mt-6 rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            {state.question}
          </p>
          <p className="mt-2 whitespace-pre-wrap">{state.answer}</p>
        </div>
      )}
    </div>
  );
}
