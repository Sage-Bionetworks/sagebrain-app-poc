/* The "connected evidence" traversal spine — a JSX port of the demo's drawSpine(). */
import { SPINE, STEPS, STEP_EDGES } from "./steps";

interface Props {
  current: number;
  /** Edges completed so far. */
  done: Set<number>;
  /** Edges completed by the latest run, drawn with the draw-in animation. */
  justDrawn: Set<number>;
  setupDone: boolean;
}

const W = 1160, Y = 34;

export function Spine({ current, done, justDrawn, setupDone }: Props) {
  const n = SPINE.length;
  const xs = SPINE.map((_, i) => 70 + i * (W - 140) / (n - 1));
  const currentEdges = new Set(STEP_EDGES[current] || []);
  // a node is "here" when it is an endpoint of the current step's edge(s)
  const here = new Set<number>();
  if (current === 0) here.add(0);
  for (const e of currentEdges) { here.add(e); here.add(e + 1); }

  const label =
    "Analysis steps: " + SPINE.map(s => s.label).join(" → ") +
    `. Steps completed: ${done.size} of ${n - 1}.` +
    (STEPS[current] ? ` Currently on ${STEPS[current].title}.` : "");

  return (
    <div className="spine-card">
      <div className="spine-caption">Connected evidence</div>
      <div className="spine-scroll" tabIndex={0} role="region"
           aria-label="Connected evidence map; scroll horizontally to explore">
        <svg className="spine-svg" viewBox={`0 0 ${W} 86`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
          {xs.slice(0, -1).map((x, i) => {
            let cls = "spine-edge";
            if (done.has(i)) cls += justDrawn.has(i) ? " drawing done" : " done";
            else if (currentEdges.has(i)) cls += " current";
            return <path key={`e${i}`} className={cls} d={`M ${x + 9} ${Y} H ${xs[i + 1] - 9}`} />;
          })}
          {SPINE.map((s, i) => {
            const nodeDone = (i === 0 && setupDone) || done.has(i - 1) || done.has(i);
            const cls = "spine-dot" + (nodeDone ? " done" : "") + (here.has(i) ? " here" : "");
            return (
              <g key={`n${i}`}>
                <title>{s.precise}</title>
                <circle cx={xs[i]} cy={Y} r={here.has(i) ? 9 : 7} className={cls} />
                <text x={xs[i]} y={Y + 26} textAnchor="middle" className={"spine-node-label" + (here.has(i) ? " here" : "")}>{s.label}</text>
                <text x={xs[i]} y={Y + 41} textAnchor="middle" className="spine-node-sub">{s.sub}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
