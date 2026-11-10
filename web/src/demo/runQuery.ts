/* The demo's runQuery(): submit SPARQL to /query, poll, return flattened
   bindings. Status wording is unchanged from the demo. */
import { ApiError, runJob, type JobBody } from "../api/jobs";
import type { Row } from "./fallback";
import { CONFIG, PREFIXES } from "./queries";

export type StatusKind = "" | "busy" | "ok" | "err";
export type OnStatus = (text: string, kind: StatusKind) => void;

interface QueryBody extends JobBody { results?: string }

export async function runQuery(sparql: string, token: string, onStatus: OnStatus): Promise<Row[]> {
  const t0 = performance.now();
  onStatus("Submitting…", "busy");
  let body: QueryBody;
  try {
    body = await runJob<QueryBody>({
      endpoint: CONFIG.endpoint,
      token,
      body: { query: PREFIXES + sparql },
      source: "sagebrain-demo",
      timeoutMs: CONFIG.timeoutMs,
      pollMs: CONFIG.pollMs,
      ramp: [700, 1200, 2000],
      onPoll: (_b, ms) => onStatus(`Running · ${(ms / 1000).toFixed(0)}s`, "busy"),
    });
  } catch (e) {
    throw e instanceof ApiError ? e : new Error(String((e as Error)?.message || e));
  }
  if (body.status === "error") {
    console.error("query error:", body.error);
    throw new Error("The query service could not complete this query. Try it again.");
  }
  const res = JSON.parse(body.results ?? "{}");
  const bindings: Record<string, { value: string }>[] = res?.results?.bindings ?? [];
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  const clock = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  onStatus(`Live result · ${bindings.length} rows · ${secs} s · ${clock}`, "ok");
  return bindings.map(b => {
    const o: Row = {};
    for (const k of Object.keys(b)) o[k] = b[k].value;
    return o;
  });
}

/** Adapter for the imperative renderers, which write status into an element. */
export function runQueryInto(token: string) {
  return (sparql: string, statusEl: HTMLElement) =>
    runQuery(sparql, token, (text, kind) => {
      statusEl.textContent = text;
      statusEl.className = "status" + (kind ? " " + kind : "");
    });
}
