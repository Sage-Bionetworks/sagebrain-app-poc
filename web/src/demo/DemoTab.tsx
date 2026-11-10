/* The guided demo from Sage_Brain demo-app-updates:demo/index.html, as React.
   The Synapse token now comes from the app's OAuth session instead of the
   demo's paste-a-PAT drawer, so the "Token" button and `k` shortcut are gone. */
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useToken } from "../auth/AuthContext";
import { CONFIG, Q } from "./queries";
import { hideTip, renderConnection, STEP_CARDS } from "./renderers";
import { ResultCard } from "./ResultCard";
import { runQuery, runQueryInto, type StatusKind } from "./runQuery";
import { Spine } from "./Spine";
import { DATASETS, PHASES, STEP_COPY, STEP_EDGES, STEPS, type DatasetKey } from "./steps";

/* Rail and mobile-select groups: each phase runs until the next one starts. */
const PHASE_STARTS = Object.keys(PHASES).map(Number);
const GROUPS = PHASE_STARTS.map((start, gi) => {
  const end = PHASE_STARTS[gi + 1] ?? STEPS.length;
  return { start, name: PHASES[start], steps: Array.from({ length: end - start }, (_, k) => start + k) };
});

export function DemoTab({ active }: { active: boolean }) {
  const [cur, setCur] = useState(0);
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());
  const [spineDone, setSpineDone] = useState<Set<number>>(new Set());
  const [justDrawn, setJustDrawn] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState(false);
  // bumping runKey remounts every card, which clears all results (the demo's "r")
  const [runKey, setRunKey] = useState(0);

  const go = useCallback((i: number) => {
    setCur(Math.max(0, Math.min(STEPS.length - 1, i)));
    setJustDrawn(new Set());
    hideTip();
  }, []);

  // mirrored in a ref: a card's onDone fires after a long await, so its closure may be stale
  const spineRef = useRef(spineDone);
  useEffect(() => { spineRef.current = spineDone; }, [spineDone]);
  const markDone = useCallback((step: number) => {
    setDoneSteps(s => new Set(s).add(step));
    const drawn = (STEP_EDGES[step] || []).filter(e => !spineRef.current.has(e));
    if (!drawn.length) return;
    setSpineDone(s => new Set([...s, ...drawn]));
    setJustDrawn(new Set(drawn));
  }, []);

  const reset = useCallback(() => {
    setDoneSteps(new Set()); setSpineDone(new Set()); setJustDrawn(new Set());
    setRunKey(k => k + 1);
    go(0);
  }, [go]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") &&
          t.closest(".chart-scroll, .tblwrap, .spine-scroll, .mech-wrap")) return;
      if (e.key === "ArrowRight") go(cur + 1);
      if (e.key === "ArrowLeft") go(cur - 1);
      if (e.key === "n") setNotes(v => !v);
      if (e.key === "r") reset();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [active, cur, go, reset]);

  useEffect(() => { if (!active) hideTip(); }, [active]);

  return (
    <div className={notes ? "demo notes" : "demo"}>
      <header className="top">
        <div className="header-copy">
          <div className="eyebrow">Sage Brain · live data exploration</div>
          <h1>From three data portals to one patient: <span className="pt mono">{CONFIG.individual}</span></h1>
          <p className="standfirst">Explore data from three disease portals, compare cohorts across two,
            and examine one NF patient’s genetic findings, cell screening data, and related drug information.</p>
        </div>
      </header>

      <Spine current={cur} done={spineDone} justDrawn={justDrawn} setupDone={doneSteps.has(0)} />

      <div className="cols">
        <nav className="rail" aria-label="Demo steps">
          {GROUPS.map(g => (
            <div className="rail-group" key={g.start}>
              <h2 className="rail-heading">{g.name}</h2>
              {g.steps.map(j => (
                <button key={j} type="button" className={"railstep" + (doneSteps.has(j) ? " done" : "")}
                        aria-current={j === cur ? "step" : undefined} onClick={() => go(j)}>
                  <span className="n">{String(j).padStart(2, "0")}</span>
                  <span className="step-title">{STEPS[j].title}</span>
                  <span className="scope">{STEPS[j].scope}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <main className="stage">
          <div className="mobile-nav">
            <label htmlFor="stepSelect">Explore</label>
            <select id="stepSelect" aria-label="Choose an exploration step" value={cur}
                    onChange={e => go(Number(e.target.value))}>
              {GROUPS.map(g => (
                <optgroup key={g.start} label={g.name}>
                  {g.steps.map(j => <option key={j} value={j}>{`${j === 0 ? "Setup" : j} · ${STEPS[j].title}`}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div id="tooltip" role="tooltip" aria-hidden="true" />

          <Fragment key={runKey}>
            <section className={"panel" + (cur === 0 ? " active" : "")}>
              <div className="eyebrow hop-eyebrow">setup</div>
              <h2>Data sources</h2>
              <p className="claim">This exploration integrates selected releases of the
                <strong> ALS, CCKP, and NF</strong> portals, alongside <strong>Reactome</strong> and{" "}
                <strong>Open Targets</strong>.</p>
              <ConnectionCard onDone={() => markDone(0)} />
              <div className="callout">The analysis moves from a comparison of three portals and an
                estimated RNA-seq harmonization to comparable cohorts across two portals, then
                examines genetic and drug screening data for one patient.</div>
            </section>

            {Object.entries(STEP_COPY).map(([k, c]) => {
              const step = Number(k);
              return (
                <section key={step} className={"panel" + (cur === step ? " active" : "")}>
                  <div className="eyebrow hop-eyebrow">{c.eyebrow}</div>
                  <h2>{c.heading}</h2>
                  <p className="claim">{c.claim}</p>
                  <ScopeBar scope={c.scope} />
                  <div className="presenter-note">{c.note}</div>
                  <ResultCard card={STEP_CARDS[step]} onDone={() => markDone(step)} />
                </section>
              );
            })}
          </Fragment>

          <div className="navbtns">
            <button className="ghost-btn" type="button" disabled={cur === 0} onClick={() => go(cur - 1)}>← Back</button>
            <button className="ghost-btn" type="button" disabled={cur === STEPS.length - 1} onClick={() => go(cur + 1)}>Next →</button>
            <span className="status">or <kbd>←</kbd> <kbd>→</kbd> · <kbd>n</kbd> notes · <kbd>r</kbd> reset</span>
          </div>
        </main>
      </div>
    </div>
  );
}

function ScopeBar({ scope }: { scope: DatasetKey[] }) {
  return (
    <div className="scopebar">
      <span className="scope-label">Sources</span>
      {(Object.keys(DATASETS) as DatasetKey[]).filter(k => scope.includes(k)).map(k => (
        <span key={k} className="source-badge">{DATASETS[k]}</span>
      ))}
    </div>
  );
}

/* Step 0: check that every pinned graph is present (the demo's connectBtn). */
function ConnectionCard({ onDone }: { onDone: () => void }) {
  const token = useToken();
  const outRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind: StatusKind; alert?: boolean }>({ text: "", kind: "" });

  async function check() {
    setBusy(true);
    try {
      const rows = await runQuery(Q.pinned, token, (text, kind) => setStatus({ text, kind }));
      const missing = renderConnection(rows, outRef.current!, runQueryInto(token));
      if (missing.length === 0) onDone();
      else setStatus({ text: "One or more data sources are unavailable. Related results may not load.", kind: "err", alert: true });
    } catch (e) {
      setStatus({ text: String((e as Error).message || e), kind: "err", alert: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="setup-grid">
        <div className="runrow" style={{ margin: 0 }}>
          <button className="run-btn" type="button" disabled={busy} onClick={check}>Check connection</button>
          <span className={"status" + (status.kind ? " " + status.kind : "")} aria-live="polite"
                role={status.alert ? "alert" : undefined}>{status.text}</span>
        </div>
      </div>
      <div ref={outRef} style={{ marginTop: 12 }} />
    </div>
  );
}
