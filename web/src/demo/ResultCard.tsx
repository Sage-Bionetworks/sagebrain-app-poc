/* A step's run card — the React replacement for the demo's buildCard():
   run button + status + recorded-result fallback + viz mount + SPARQL disclosure.
   The chart itself is drawn by the step's (verbatim) renderer into `vizRef`;
   React never renders children into that element. */
import { useRef, useState } from "react";
import { useToken } from "../auth/AuthContext";
import { FALLBACK, FALLBACK_DATE } from "./fallback";
import { el, presentResults, type StepCard } from "./renderers";
import { runQuery, type StatusKind } from "./runQuery";

interface Props {
  card: StepCard;
  onDone: () => void;
}

export function ResultCard({ card, onDone }: Props) {
  const token = useToken();
  const vizRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind: StatusKind; alert?: boolean }>({ text: "", kind: "" });
  const [offerFallback, setOfferFallback] = useState(false);
  const fallback = card.fallbackKey ? FALLBACK[card.fallbackKey] : undefined;

  async function run() {
    const viz = vizRef.current!;
    setRunning(true);
    try {
      const rows = await runQuery(card.sparql, token, (text, kind) => setStatus({ text, kind }));
      viz.replaceChildren();
      if (rows.length) card.render(rows, viz);
      else viz.appendChild(el("p", "empty-state", "No matching records were found in the selected data sources."));
      presentResults(viz);
      setOfferFallback(false);
      setHasResult(true);
      onDone();
    } catch (e) {
      setStatus({ text: String((e as Error).message || e), kind: "err", alert: true });
      if (fallback) setOfferFallback(true);
    } finally {
      setRunning(false);
    }
  }

  function showRecorded() {
    const viz = vizRef.current!;
    viz.replaceChildren();
    viz.appendChild(el("p", "recorded-stamp",
      `Previously recorded results · ${FALLBACK_DATE[card.fallbackKey!] || "date unavailable"}`));
    card.render(fallback!.map(r => ({ ...r })), viz);
    presentResults(viz);
    setHasResult(true);
    onDone();
  }

  return (
    <div className={"card result-card" + (running ? " is-loading" : "")} aria-busy={running}>
      <div className="runrow">
        <button className="run-btn" type="button" aria-label={card.label} disabled={running} onClick={run}>
          {running ? "Running…" : hasResult ? "Run again" : "Run query"}
        </button>
        <span className={"status" + (status.kind ? " " + status.kind : "")} aria-live="polite"
              role={status.alert ? "alert" : undefined}>{status.text}</span>
        {offerFallback && (
          <button className="ghost-btn fallback-btn" type="button" disabled={running} onClick={showRecorded}>
            Show previously recorded results
          </button>
        )}
      </div>
      <div className="loading-state" hidden={!running || hasResult} aria-hidden="true">
        <span /><span /><span />
      </div>
      <div className="viz-mount" ref={vizRef} />
      <details className="qbox prov">
        <summary>View query (SPARQL)</summary>
        <pre>{card.sparql}</pre>
      </details>
    </div>
  );
}
