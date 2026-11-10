/* Client for the Sage Brain async job API. /ask and /query share one contract:
     POST {endpoint}           -> 202 { job_id, status: "pending" }
     GET  {endpoint}/{job_id}  -> 200 { status: pending|running|complete|error, ... }
   Both sit behind a Lambda authorizer that accepts a Synapse bearer token
   (OAuth access token or PAT) from a member of the Sage Brain team. */

export type JobStatus = "pending" | "running" | "complete" | "error";

export interface JobBody {
  job_id?: string;
  status: JobStatus;
  error?: string;
}

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Audience-facing wording for the failures that actually happen (from the demo). */
export function friendlyHttp(status: number, detail?: string): string {
  if (status === 401 || status === 403)
    return "Access denied. Your Synapse account must be on the Sage Brain team — or your session expired; sign out and in again.";
  if (status === 429) return "The service is busy. Please try again shortly.";
  if (status >= 500) return "The service is unavailable. Please try again shortly.";
  if (detail) return detail;
  return `The service returned an unexpected response (HTTP ${status}).`;
}

async function errorFrom(resp: Response): Promise<ApiError> {
  let detail: string | undefined;
  try { detail = (await resp.json())?.error; } catch { /* not JSON */ }
  return new ApiError(friendlyHttp(resp.status, detail), resp.status);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(signal!.reason); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface RunJobOptions<T> {
  endpoint: string;
  token: string;
  body: unknown;
  /** X-Source tag, logged by the API. */
  source: string;
  timeoutMs: number;
  /** Steady-state poll interval. */
  pollMs: number;
  /** Faster first polls so short jobs return snappily. */
  ramp?: number[];
  signal?: AbortSignal;
  onSubmitted?: (jobId: string) => void;
  /** Called after every poll, including the final one. */
  onPoll?: (body: T, elapsedMs: number) => void;
}

/** Submit a job and poll it to completion. Resolves with the final body
    (status "complete" or "error"); rejects on HTTP/network failure, timeout or abort. */
export async function runJob<T extends JobBody>(opts: RunJobOptions<T>): Promise<T> {
  const headers = { Authorization: `Bearer ${opts.token}`, "X-Source": opts.source };
  const t0 = performance.now();

  let sub: Response;
  try {
    sub = await fetch(opts.endpoint, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    console.error(e);
    throw new ApiError("The service is unavailable. Please try again shortly.");
  }
  if (!sub.ok) throw await errorFrom(sub);
  const { job_id } = (await sub.json()) as { job_id: string };
  console.info("sagebrain job", job_id);
  opts.onSubmitted?.(job_id);

  const deadline = t0 + opts.timeoutMs;
  const ramp = opts.ramp ?? [];
  for (let polls = 0; ; polls++) {
    await sleep(ramp[polls] ?? opts.pollMs, opts.signal);
    let poll: Response;
    try {
      poll = await fetch(`${opts.endpoint}/${job_id}`, { headers, signal: opts.signal });
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      console.error(e);
      throw new ApiError("Lost the connection to the service while the job was running.");
    }
    if (!poll.ok) throw await errorFrom(poll);
    const body = (await poll.json()) as T;
    opts.onPoll?.(body, performance.now() - t0);
    if (body.status === "complete" || body.status === "error") return body;
    if (performance.now() > deadline)
      throw new ApiError(`The job did not finish within ${Math.round(opts.timeoutMs / 1000)} seconds. It may still be running.`);
  }
}
