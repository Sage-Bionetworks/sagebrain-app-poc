/* Natural-language Ask, ported from the Streamlit POC (app.py):
   POST /ask {question} -> job_id, then poll GET /ask/{job_id}, streaming the
   agent's steps (SPARQL tool calls and their result previews) as they land,
   and rendering the final answer as markdown. */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { runJob, type JobBody } from "../api/jobs";
import { useToken } from "../auth/AuthContext";
import { API_BASE_URL } from "../config";

interface AgentStep {
  type?: string;
  tool?: string;
  sparql?: string;
  preview?: string;
  [k: string]: unknown;
}

interface AskBody extends JobBody {
  status_detail?: string;
  steps?: AgentStep[];
  answer?: string;
}

type RunState = "running" | "complete" | "error" | "cancelled";

interface Run {
  id: number;
  question: string;
  state: RunState;
  label: string;
  steps: AgentStep[];
  answer?: string;
  error?: string;
}

const POLL_MS = 3000;           // the API's Retry-After is 2 s; the agent is slow
const TIMEOUT_MS = 5 * 60_000;  // same 5-minute budget as the Streamlit app

const EXAMPLES = [
  "What types of biological entities are in this knowledge graph?",
  "Which assays are shared between the ALS and NF portals?",
  "Which drugs were screened on cells derived from patient JH-2-002?",
];

let nextId = 1;

export function AskTab() {
  const token = useToken();
  const [question, setQuestion] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const running = runs[0]?.state === "running";

  useEffect(() => () => abortRef.current?.abort(), []);

  const update = (id: number, patch: Partial<Run>) =>
    setRuns(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));

  async function ask(text: string) {
    const q = text.trim();
    if (!q || running) return;
    const id = nextId++;
    const ac = new AbortController();
    abortRef.current = ac;
    setRuns(rs => [{ id, question: q, state: "running", label: "Submitting…", steps: [] }, ...rs]);
    setQuestion("");
    try {
      const body = await runJob<AskBody>({
        endpoint: `${API_BASE_URL}/ask`,
        token,
        body: { question: q },
        source: "sagebrain-app",
        timeoutMs: TIMEOUT_MS,
        pollMs: POLL_MS,
        ramp: [1500, 2000],
        signal: ac.signal,
        onSubmitted: () => update(id, { label: "Agent is thinking…" }),
        onPoll: (b, ms) => {
          const steps = b.steps ?? [];
          let label = b.status_detail || `Agent is thinking… (${Math.round(ms / 1000)}s elapsed)`;
          if (steps.length) label += ` — ${steps.length} step${steps.length === 1 ? "" : "s"}`;
          update(id, { steps, label });
        },
      });
      if (body.status === "error") {
        update(id, { state: "error", label: "Agent error", error: body.error || "Unknown error" });
      } else {
        const n = body.steps?.length ?? 0;
        update(id, { state: "complete", label: `Done — ${n} step${n === 1 ? "" : "s"}`, answer: body.answer });
      }
    } catch (e) {
      if (ac.signal.aborted) update(id, { state: "cancelled", label: "Cancelled" });
      else update(id, { state: "error", label: "Failed", error: (e as Error).message });
    }
  }

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void ask(question); };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void ask(question); }
  };

  return (
    <div className="ask">
      <div className="eyebrow hop-eyebrow">ask · natural-language query</div>
      <h2 className="ask-title">Ask the knowledge graph</h2>
      <p className="claim">
        An agent turns your question into SPARQL, runs it against the Sage Brain graphs, and
        explains what it found. You can watch each query it runs as it works.
      </p>

      <form className="card ask-form" onSubmit={onSubmit}>
        <label htmlFor="question" className="visually-hidden">Question</label>
        <textarea
          id="question" rows={3} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={onKeyDown}
          placeholder="What types of biological entities are in this knowledge graph?"
        />
        <div className="runrow" style={{ margin: 0 }}>
          <button className="run-btn" type="submit" disabled={!question.trim() || running}>Ask</button>
          {running && (
            <button className="ghost-btn" type="button" onClick={() => abortRef.current?.abort()}>Cancel</button>
          )}
          <span className="status"><kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> to ask</span>
        </div>
        {runs.length === 0 && (
          <div className="examples">
            <span className="scope-label">Try</span>
            {EXAMPLES.map(x => (
              <button key={x} type="button" className="example-chip" onClick={() => setQuestion(x)}>{x}</button>
            ))}
          </div>
        )}
      </form>

      {runs.map(r => <RunView key={r.id} run={r} />)}
    </div>
  );
}

function RunView({ run }: { run: Run }) {
  const statusClass =
    run.state === "running" ? "status busy" : run.state === "error" ? "status err" : run.state === "complete" ? "status ok" : "status";
  return (
    <section className="card ask-run" aria-busy={run.state === "running"}>
      <p className="ask-question">{run.question}</p>
      <details className="qbox ask-steps" open={run.state === "running" || undefined}>
        <summary>
          <span className={statusClass} aria-live="polite">{run.label}</span>
        </summary>
        {run.steps.length === 0 && run.state === "running" && (
          <div className="loading-state" aria-hidden="true"><span /><span /><span /></div>
        )}
        <ol className="step-list">
          {run.steps.map((s, i) => <StepView key={i} n={i + 1} step={s} />)}
        </ol>
      </details>
      {run.error && <p className="status err" role="alert">{run.error}</p>}
      {run.state === "complete" && (
        <div className="answer result-enter">
          <div className="eyebrow">Answer</div>
          {run.answer ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{run.answer}</ReactMarkdown> : <p><em>(no answer)</em></p>}
        </div>
      )}
    </section>
  );
}

function StepView({ n, step }: { n: number; step: AgentStep }) {
  const tool = step.tool ? <code>{step.tool}</code> : null;
  if (step.type === "tool_call")
    return <li><div className="step-head">Step {n} — tool call: {tool}</div><pre>{step.sparql ?? ""}</pre></li>;
  if (step.type === "tool_result")
    return <li><div className="step-head">Step {n} — result: {tool}</div><pre>{step.preview ?? ""}</pre></li>;
  return <li><div className="step-head">Step {n}</div><pre>{JSON.stringify(step, null, 2)}</pre></li>;
}
