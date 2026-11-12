// @ts-nocheck
/* Step renderers for the guided demo, ported from Sage_Brain
   demo-app-updates:demo/index.html.

   The chart code below (steps 1–8) is kept verbatim from the demo — it is
   imperative DOM/SVG code that writes into the card's mount element, and the
   demo's numbers, ordering and wording were verified against the pinned graphs.
   React owns everything around it (run buttons, status, fallbacks, navigation);
   see ResultCard.tsx. Type checking is off for this file only, because it is
   unmodified untyped JS. */
import { CONFIG, Q, RNASEQ_LABELS, TERM_GROUP_OF } from "./queries";
import type { Row } from "./fallback";

export type RenderFn = (rows: Row[], viz: HTMLElement) => void;
export interface StepCard {
  label: string;
  sparql: string;
  render: RenderFn;
  fallbackKey?: string;
}

/* The demo's buildCard() wired each step's renderer to a run button. Here it
   only registers the step; ResultCard.tsx renders the button and status. */
export const STEP_CARDS: Record<number, StepCard> = {};
function buildCard(mountId, btnLabel, sparql, onData, fallbackKey) {
  STEP_CARDS[Number(mountId.replace("card-", ""))] =
    { label: btnLabel, sparql, render: onData, fallbackKey };
}

/* =================== tooltip =================== */
/* One fixed-position tooltip element, rendered by DemoTab as #tooltip. */
const tipEl = () => document.getElementById("tooltip");
function fillTip(rows) {
  const tip = tipEl(); if (!tip) return;
  tip.replaceChildren();
  for (const [k, v] of rows) {
    const d = document.createElement("div");
    const kv = document.createElement("span"); kv.className = "v"; kv.textContent = v;
    const kk = document.createElement("span"); kk.className = "k"; kk.textContent = " " + k;
    d.append(kv, kk); tip.appendChild(d);
  }
  tip.style.display = "block";
}
function moveTip(evt) {
  const tip = tipEl(); if (!tip) return;
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + w > innerWidth - 8) x = evt.clientX - w - pad;
  if (y + h > innerHeight - 8) y = evt.clientY - h - pad;
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
function showTip(evt, rows) { fillTip(rows); moveTip(evt); }
export function hideTip() { const tip = tipEl(); if (tip) tip.style.display = "none"; }
/* Content is built once on enter; pointermove only repositions. */
function bindTip(node, rowsFn) {
  node.addEventListener("pointerenter", e => { fillTip(rowsFn()); moveTip(e); });
  node.addEventListener("pointermove", moveTip);
  node.addEventListener("pointerleave", hideTip);
}

/* =================== shared helpers (verbatim) =================== */
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function resultMetrics(viz, metrics) {
  const row = el("div", "metrics");
  row.style.setProperty("--metric-count", metrics.length);
  for (const [value, label] of metrics) {
    const metric = el("div", "metric");
    metric.append(el("span", "metric-value", Number(value).toLocaleString()),
                  el("span", "metric-label", label));
    row.appendChild(metric);
  }
  viz.appendChild(row);
}

export function presentResults(viz) {
  for (const table of viz.querySelectorAll("table.data")) {
    const head = table.tHead?.rows[0];
    if (!head) continue;
    [...head.cells].forEach((th, i) => {
      const cells = [...table.tBodies].flatMap(body => [...body.rows])
        .map(row => row.cells[i]).filter(cell => cell && cell.colSpan === 1);
      const values = cells.map(cell => cell.textContent.trim()).filter(value => value !== "—");
      if (values.length && values.every(value => /^\d[\d,.]*$/.test(value))) {
        th.classList.add("num");
        cells.forEach(cell => cell.classList.add("num"));
      }
    });
  }
  for (const chart of viz.querySelectorAll("table, .barlist, .barlist2")) {
    let wrap = chart.parentElement;
    if (!wrap.matches(".tblwrap, .chart-scroll")) {
      wrap = el("div", chart.tagName === "TABLE" ? "tblwrap" : "chart-scroll");
      chart.before(wrap);
      wrap.appendChild(chart);
    }
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", chart.tagName === "TABLE" ? "Results table" : "Results chart");
  }
  for (const wrap of viz.querySelectorAll(".mech-wrap")) {
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    if (!wrap.hasAttribute("aria-label")) wrap.setAttribute("aria-label", "Drug targets and pathways diagram");
  }
  viz.classList.remove("result-enter");
  void viz.offsetWidth;
  viz.classList.add("result-enter");
}
function dataTable(viz, headers, rows) {
  const det = el("details"); det.className = "qbox";
  det.appendChild(el("summary", null, "View all results as a table"));
  const wrap = el("div", "tblwrap");
  const t = el("table", "data");
  const tr = el("tr");
  headers.forEach(h => tr.appendChild(el("th", null, h)));
  const thead = el("thead"); thead.appendChild(tr); t.appendChild(thead);
  const tb = el("tbody");
  rows.forEach(r => {
    const tr2 = el("tr");
    r.forEach(v => tr2.appendChild(el("td", null, v)));
    tb.appendChild(tr2);
  });
  t.appendChild(tb); wrap.appendChild(t); det.appendChild(wrap);
  viz.appendChild(det);
}


/* =================== step 0: connection =================== */
/* From the demo's connectBtn handler: renders the pinned-graph table, plus the
   slow full-census button. Returns the pinned graphs that were not found. */
const DATASET_LABEL = {
  nf: "NF Data Portal — patients, specimens, files",
  als: "ALS Knowledge Portal — datasets and files",
  cckp: "Cancer Complexity KP — datasets, publications, tools",
  opentargets: "Open Targets — drug targets and indications",
  reactome: "Reactome — biological pathways",
};
export function renderConnection(
  rows: Row[], out: HTMLElement,
  run: (sparql: string, statusEl: HTMLElement) => Promise<Row[]>,
): string[] {
    out.replaceChildren();
    const pinned = [CONFIG.nf, CONFIG.als, CONFIG.cckp, CONFIG.ot, CONFIG.reactome];
    // The query reads two manifest shapes (declared counts, build times) and can
    // return more than one row per graph — merge them, first non-empty value wins.
    const byGraph = new Map();
    for (const r of rows) {
      const m = byGraph.get(r.g) || {};
      for (const k of ["triples", "version", "built"]) if (r[k] && !m[k]) m[k] = r[k];
      byGraph.set(r.g, m);
    }
    const t = el("table", "data");
    const h = el("tr");
    ["source", "reported facts", "release"].forEach(x => h.appendChild(el("th", null, x)));
    const thead = el("thead"); thead.appendChild(h); t.appendChild(thead);
    const tb = el("tbody");
    for (const g of pinned) {
      const r = byGraph.get(g);
      const tr = el("tr");
      // Show the source name in the overview.
      const td1 = el("td");
      const plain = el("span", "plain", DATASET_LABEL[g.split(":")[2]] || g);
      plain.style.fontWeight = "650";
      td1.appendChild(plain);
      tr.appendChild(td1);
      if (r) {
        if (r.triples) {
          tr.appendChild(el("td", null, Number(r.triples).toLocaleString()));
        } else {
          // A graph may publish a build manifest without a declared triple count.
          const nd = el("td", null, "not reported");
          nd.style.color = "var(--muted)";
          tr.appendChild(nd);
        }
        // Portal snapshots carry no pav:version — their release IS the date
        // in the urn (urn:sagebrain:nf:2026-09-28 -> 2026-09-28).
        const urnDate = (g.split(":").pop().match(/^\d{4}-\d{2}-\d{2}$/) || [])[0];
        tr.appendChild(el("td", null, r.version || urnDate || "—"));
      } else {
        const miss = el("td", null, "Unavailable");
        miss.style.color = "var(--critical)"; miss.style.fontWeight = "650";
        miss.colSpan = 2; tr.appendChild(miss);
      }
      tb.appendChild(tr);
    }
    t.appendChild(tb); out.appendChild(t);
    presentResults(out);
   
    // full census stays available, explicitly marked slow
    const censusRow = el("div", "runrow");
    const censusBtn = el("button", "ghost-btn", "Count all available data sources (may take time)");
    censusBtn.type = "button";
    const cst = el("span", "status");
    censusRow.append(censusBtn, cst);
    const censusOut = el("div");
    out.append(censusRow, censusOut);
    censusBtn.addEventListener("click", async () => {
      censusBtn.disabled = true;
      try {
        const all = await run(Q.graphs, cst);
        censusOut.replaceChildren();
        const t2 = el("table", "data");
        const h2 = el("tr");
        ["data source", "facts counted"].forEach(x => h2.appendChild(el("th", null, x)));
        const th2 = el("thead"); th2.appendChild(h2); t2.appendChild(th2);
        const tb2 = el("tbody");
        for (const r of all) {
          const tr = el("tr");
          tr.appendChild(el("td", "mono", r.g));
          tr.appendChild(el("td", null, Number(r.triples).toLocaleString()));
          tb2.appendChild(tr);
        }
        t2.appendChild(tb2); censusOut.appendChild(t2);
        presentResults(censusOut);
      } catch (e) {
        cst.textContent = String(e.message || e); cst.className = "status err";
      } finally { censusBtn.disabled = false; }
    });
    // D1: test membership, not row count — a graph with two manifest rows is still present
    const found = new Set(rows.map(r => r.g));
    const missing = pinned.filter(g => !found.has(g));
    if (missing.length) console.warn("missing pinned graph(s):", missing,
                                     "— re-pin CONFIG, or re-deposit the snapshot");
    return missing;
}

/* =================== step 1: three portals compared =================== */
const PORTAL_ROWS = [
  { g: () => CONFIG.als,  name: "ALS Knowledge Portal" },
  { g: () => CONFIG.cckp, name: "Cancer Complexity KP" },
  { g: () => CONFIG.nf,   name: "NF Data Portal" },
];
const BIOLINK_CLASSES = [
  ["https://w3id.org/biolink/vocab/Dataset",            "datasets"],
  ["https://w3id.org/biolink/vocab/Study",              "studies"],
  ["https://w3id.org/biolink/vocab/Publication",        "publications"],
  ["https://w3id.org/biolink/vocab/IndividualOrganism", "individuals"],
  ["https://w3id.org/biolink/vocab/MaterialSample",     "specimens"],
];
buildCard("card-1", "Run step 1 — compare the three portals", Q.portals, (rows, viz) => {
  const count = new Map();
  rows.forEach(r => count.set(r.g + "|" + r.class, +r.n));

  viz.appendChild(el("p", "viz-title", "Five entities compared across portals"));
  viz.appendChild(el("p", "viz-sub",
    "A blank cell means the selected portal release does not include that entity. " +
    "Only the NF data includes individual and specimen entities currently."));
  const t = el("table", "data");
  const h = el("tr");
  h.appendChild(el("th", null, "portal"));
  BIOLINK_CLASSES.forEach(([, label]) => h.appendChild(el("th", null, label)));
  const thead = el("thead"); thead.appendChild(h); t.appendChild(thead);
  const tb = el("tbody");
  for (const p of PORTAL_ROWS) {
    const g = p.g();
    const tr = el("tr");
    const td1 = el("td");
    const plain = el("span", "plain", p.name);
    plain.style.fontWeight = "650";
    td1.appendChild(plain);
    tr.appendChild(td1);
    for (const [cls, label] of BIOLINK_CLASSES) {
      const n = count.get(g + "|" + cls);
      const td = el("td", null, n !== undefined ? n.toLocaleString() : "—");
      if (n === undefined) td.style.color = "var(--muted)";
      td.setAttribute("aria-label", n !== undefined
        ? `${p.name}: ${n.toLocaleString()} ${label}`
        : `${p.name}: no ${label} published yet`);
      bindTip(td, () => [[n !== undefined ? n.toLocaleString() : "none published yet", label]]);
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
  t.appendChild(tb); viz.appendChild(t);
  viz.appendChild(el("p", "mech-note",
    "CCKP lists the most datasets and publications. NF is the only portal in this " +
    "comparison with individuals and specimens."));
  dataTable(viz, ["portal graph", "Biolink class", "count"],
    rows.map(r => [r.g, r.class.split("/").pop(), r.n]));
}, "portals");

/* =================== step 2: estimated RNA-seq harmonization =================== */
/* ribbon width in px for a link carrying n items (steps 2 and 7 share the scale) */
const ribbonWidth = n => Math.min(9, 2 + 1.4 * Math.log2(Math.max(1, n)));
/* portal key, short label, legend label, colour */
const LINK_PORTALS = [
  ["nf", "NF", "NF Data Portal", "--accent"],
  ["cckp", "CCKP", "Cancer Complexity KP", "--series-3"],
  ["als", "ALS", "ALS Knowledge Portal", "--series-2"],
];
/* Two-column link diagram. left/right: ordered { key, label, perPortal: Map(portal -> n), tip };
   links: { from, to, portal, n }, drawn one line per portal, width on a log scale. */
function drawPortalLinks(viz, { leftHead, rightHead, left, right, links, ariaLabel }) {
  const NS = "http://www.w3.org/2000/svg";
  const countText = counts => LINK_PORTALS.filter(([k]) => counts.get(k))
    .map(([k, label]) => `${label} ${counts.get(k)}`).join(" · ");
  // measure rendered text so lines start past the longest left label and nothing is clipped
  function textWidth(strings, cls) {
    const probe = document.createElementNS(NS, "svg");
    probe.setAttribute("class", "mech-svg");
    probe.style.position = "absolute"; probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    let w = 0;
    for (const str of strings) {
      const t = document.createElementNS(NS, "text");
      t.setAttribute("class", cls); t.textContent = str;
      probe.appendChild(t); w = Math.max(w, t.getComputedTextLength());
    }
    probe.remove();
    return w;
  }
  const rowH = 34, headH = 34, x1 = 10, gap = 240;
  const leftW = Math.max(textWidth(left.flatMap(n => [n.label, countText(n.perPortal)]), "mech-chip"),
                         textWidth([leftHead], "mech-colhead") - gap);
  const rightW = Math.max(textWidth(right.flatMap(n => [n.label, countText(n.perPortal)]), "mech-chip"),
                          textWidth([rightHead], "mech-colhead"));
  const linkStart = x1 + leftW + 12, x2 = linkStart + gap, linkEnd = x2 - 10;
  const W = Math.ceil(x2 + rightW + 16);
  const nMax = Math.max(left.length, right.length), contentH = nMax * rowH;
  const H = headH + contentH + 10;
  // the shorter column spreads evenly across the taller one's height
  const rowY = (list, i) => list.length === nMax
    ? headH + i * rowH + rowH / 2 : headH + (i + 0.5) / list.length * contentH;

  const wrap = el("div", "mech-wrap");
  wrap.setAttribute("aria-label", ariaLabel);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "mech-svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W); svg.setAttribute("height", H);
  svg.style.maxWidth = "100%"; svg.style.height = "auto";
  for (const [x, text] of [[x1, leftHead], [x2, rightHead]]) {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", x); t.setAttribute("y", 16);
    t.setAttribute("class", "mech-colhead"); t.textContent = text;
    svg.appendChild(t);
  }

  const OFFSET = { nf: -4, cckp: 0, als: 4 };
  const colour = Object.fromEntries(LINK_PORTALS.map(([k, , , c]) => [k, c]));
  const leftIndex = new Map(left.map((n, i) => [n.key, i]));
  const rightIndex = new Map(right.map((n, i) => [n.key, i]));
  const svgLinks = [];
  for (const l of links) {
    const y1 = rowY(left, leftIndex.get(l.from)) + OFFSET[l.portal];
    const y2 = rowY(right, rightIndex.get(l.to)) + OFFSET[l.portal];
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", `M ${linkStart} ${y1} C ${linkStart + 90} ${y1}, ${linkEnd - 100} ${y2}, ${linkEnd} ${y2}`);
    p.setAttribute("class", "mech-link");
    p.style.stroke = `var(${colour[l.portal]})`;
    p.style.strokeWidth = ribbonWidth(l.n) + "px";
    svg.appendChild(p);
    svgLinks.push({ el: p, from: l.from, to: l.to });
  }

  function node(n, x, y, match) {
    const chip = document.createElementNS(NS, "text");
    chip.setAttribute("x", x); chip.setAttribute("y", y + 4);
    chip.setAttribute("class", "mech-chip"); chip.textContent = n.label;
    bindTip(chip, n.tip);
    chip.addEventListener("pointerenter", () => {
      svg.classList.add("focus");
      for (const l of svgLinks) l.el.classList.toggle("on", match(l));
    });
    chip.addEventListener("pointerleave", () => {
      svg.classList.remove("focus");
      for (const l of svgLinks) l.el.classList.remove("on");
    });
    svg.appendChild(chip);
    // count line: each portal's label in its own colour
    const line = document.createElementNS(NS, "text");
    line.setAttribute("x", x); line.setAttribute("y", y + 14);
    line.setAttribute("class", "mech-chip dim");
    LINK_PORTALS.filter(([k]) => n.perPortal.get(k)).forEach(([k, label, , c], i) => {
      if (i) line.appendChild(document.createElementNS(NS, "tspan")).textContent = " · ";
      const lab = document.createElementNS(NS, "tspan");
      lab.textContent = label; lab.style.fill = `var(${c})`; lab.style.fontWeight = "700";
      line.appendChild(lab);
      line.appendChild(document.createElementNS(NS, "tspan")).textContent = " " + n.perPortal.get(k);
    });
    svg.appendChild(line);
  }
  left.forEach((n, i) => node(n, x1, rowY(left, i), l => l.from === n.key));
  right.forEach((n, i) => node(n, x2, rowY(right, i), l => l.to === n.key));
  wrap.appendChild(svg); viz.appendChild(wrap);

  const legend = el("div", "legend");
  for (const [, , name, c] of LINK_PORTALS) {
    const k = el("span"); const sw = el("span", "key line"); sw.style.background = `var(${c})`;
    k.append(sw, document.createTextNode(name));
    legend.appendChild(k);
  }
  viz.appendChild(legend);
}

buildCard("card-2", "Run step 2 — find RNA-seq datasets across the three portals", Q.rnaseq, (rows, viz) => {
  const NAME = Object.fromEntries(LINK_PORTALS.map(([k, label]) => [k, label]));
  const split = v => (v || "").split(" | ").filter(Boolean);
  const wanted = new Set(RNASEQ_LABELS.map(l => l.toLowerCase()));
  const groupsOf = r => new Set([
    ...split(r.tissues).map(t => ["tissue", TERM_GROUP_OF.get("tissue|" + t.toLowerCase())]),
    ...split(r.diseases).map(d => ["disease", TERM_GROUP_OF.get("disease|" + d.toLowerCase())]),
  ].filter(([, g]) => g).map(([f, g]) => f + "|" + g));

  const perPortal = new Map();               // portal -> datasets
  const byLabel = new Map();                 // "portal||label" -> Set(dataset)
  const byGroup = new Map();                 // "facet|group" -> Map(portal -> Set(dataset))
  for (const r of rows) {
    perPortal.set(r.portal, (perPortal.get(r.portal) || 0) + 1);
    for (const a of split(r.assays)) {
      if (!wanted.has(a.toLowerCase())) continue;
      const k = r.portal + "||" + a;
      if (!byLabel.has(k)) byLabel.set(k, new Set());
      byLabel.get(k).add(r.dataset);
    }
    r.groups = groupsOf(r);
    for (const k of r.groups) {
      if (!byGroup.has(k)) byGroup.set(k, new Map());
      const m = byGroup.get(k);
      if (!m.has(r.portal)) m.set(r.portal, new Set());
      m.get(r.portal).add(r.dataset);
    }
  }
  // only groups reached by two or more portals are shown
  const shared = [...byGroup].filter(([, m]) => m.size >= 2).map(([key, m]) => ({ key, m }));
  const total = g => [...g.m.values()].reduce((s, set) => s + set.size, 0);
  shared.sort((a, b) => (b.m.size - a.m.size) || (total(b) - total(a)));
  const groupLabel = key => {
    const [facet, group] = key.split("|");
    return (facet === "tissue" ? "Tissue: " : "Disease: ") + group;
  };

  const left = [...byLabel].sort((a, b) => b[1].size - a[1].size).map(([key, set]) => {
    const portal = key.slice(0, key.indexOf("||"));
    return { key, label: key.slice(key.indexOf("||") + 2), portal, set,
             perPortal: new Map([[portal, set.size]]) };
  });
  const links = [];
  for (const l of left) for (const g of shared) {
    const there = g.m.get(l.portal);
    if (!there) continue;
    let n = 0;
    for (const d of l.set) if (there.has(d)) n++;
    if (n) links.push({ from: l.key, to: g.key, portal: l.portal, n });
  }
  const top = (list, label) => list.sort((a, b) => b.n - a.n).slice(0, 4)
    .map(lk => [`${lk.n} datasets`, label(lk)]);
  for (const l of left) l.tip = () => [[`${l.set.size} datasets`, NAME[l.portal]],
    ...top(links.filter(lk => lk.from === l.key), lk => groupLabel(lk.to))];
  const right = shared.map(g => ({
    key: g.key, label: groupLabel(g.key),
    perPortal: new Map([...g.m].map(([k, set]) => [k, set.size])),
    tip: () => LINK_PORTALS.filter(([k]) => g.m.has(k))
      .map(([k, label]) => [`${g.m.get(k).size} datasets`, label]),
  }));

  viz.appendChild(el("p", "viz-title", "RNA-seq across three portals"));
  viz.appendChild(el("p", "viz-sub",
    "Left: RNA-seq as each portal labels it. Right: tissue and disease groups shared by at " +
    "least two portals. Line colour shows the portal; line width shows the number of datasets."));
  drawPortalLinks(viz, {
    leftHead: "RNA-SEQ LABEL", rightHead: "SHARED TISSUE OR DISEASE GROUP",
    left, right, links, ariaLabel: "RNA-seq datasets linked to shared tissue and disease groups",
  });
  const sharedKeys = new Set(shared.map(g => g.key));
  const alone = new Map();
  for (const r of rows) if (![...r.groups].some(k => sharedKeys.has(k)))
    alone.set(r.portal, (alone.get(r.portal) || 0) + 1);
  viz.appendChild(el("p", "mech-note",
    "RNA-seq datasets: " +
    LINK_PORTALS.map(([k, label]) => `${label} ${perPortal.get(k) || 0}`).join(" · ") +
    ". Without a shared tissue or disease group: " +
    LINK_PORTALS.map(([k, label]) => `${label} ${alone.get(k) || 0}`).join(" · ") + "."));

  dataTable(viz, ["portal", "dataset", "name", "assays", "tissues", "diseases"],
    rows.map(r => [NAME[r.portal] || r.portal, r.dataset, r.datasetName || "—",
                   r.assays || "—", r.tissues || "—", r.diseases || "—"]));
  if (rows[0].summary) viz.lastElementChild.querySelector("summary").after(el("p", "viz-sub",
    "Recorded summary: dataset names and tissue or disease terms outside the groups are not included."));
}, "rnaseq");

/* =================== step 3: cohort across ALS + NF =================== */
buildCard("card-3", "Run step 3 — compare cohorts across ALS and NF", Q.assays, (rows, viz) => {
  rows.forEach(r => { r.nf = +r.nfFiles; r.als = +r.alsFiles; });
  rows.sort((a, b) => (b.nf + b.als) - (a.nf + a.als));
  const max = Math.max(...rows.map(r => Math.max(r.nf, r.als)));
  const rna = rows.find(r => r.assay === "RNA-seq");
  if (rna) resultMetrics(viz, [
    [rows.length, "Shared assays"],
    [rna.nfIndividuals, "People with RNA-seq · NF"],
    [rna.alsIndividuals, "People with RNA-seq · ALS"],
  ]);

  viz.appendChild(el("p", "viz-title",
    "People and files per shared assay"));
  viz.appendChild(el("p", "viz-sub",
    "These assay labels appear in both portals. The chart includes human data only. " +
    "Bars show file counts on the same scale; each label gives files and distinct people."));
  const grid = el("div", "barlist2");
  const series = [
    { key: "NF",  n: r => r.nf,  color: "var(--accent)",
      depth: r => [Number(r.nfIndividuals).toLocaleString(), "distinct individuals"] },
    { key: "ALS", n: r => r.als, color: "var(--series-2)",
      depth: r => [Number(r.alsIndividuals).toLocaleString(), "distinct individuals"] },
  ];
  rows.forEach((r, i) => {
    const lab = el("div", "bar-label");
    lab.appendChild(el("span", "plain", r.assay));
    grid.appendChild(lab);
    for (const s of series) {
      const tag = el("div", "bar-portal");
      const dot = el("span", "key"); dot.style.background = s.color;
      tag.append(dot, document.createTextNode(s.key));
      const track = el("div", "bar-track");
      const bar = el("div", "bar");
      bar.style.background = s.color;
      bar.style.width = (s.n(r) / max * 100) + "%";
      track.appendChild(bar);
      const people = s.depth(r)[0];
      const val = el("div", "bar-val",
        `${s.n(r).toLocaleString()} ${s.n(r) === 1 ? "file" : "files"} · ` +
        `${people} ${people === "1" ? "person" : "people"}`);
      const tipRows = () => [
        [s.n(r).toLocaleString() + " files", s.key + " · " + r.assay],
        s.depth(r),
      ];
      for (const elm of [tag, track, val]) bindTip(elm, tipRows);
      grid.append(tag, track, val);
    }
    if (i < rows.length - 1) grid.appendChild(el("div", "pairgap"));
  });
  viz.appendChild(grid);
  const leg = el("div", "legend");
  for (const s of series) {
    const k = el("span"); const sw = el("span", "key"); sw.style.background = s.color;
    k.append(sw, document.createTextNode(
      s.key === "NF" ? "NF Data Portal — human files" : "ALS Knowledge Portal — human files"));
    leg.appendChild(k);
  }
  viz.appendChild(leg);
  if (rna) viz.appendChild(el("p", "mech-note",
    "RNA-seq data includes " +
    `${Number(rna.nfIndividuals).toLocaleString()} people in NF and ` +
    `${Number(rna.alsIndividuals).toLocaleString()} in ALS. ` +
    "ALS also has two human whole-genome sequencing files, but neither includes a " +
    "person identifier, so the people count for that assay is zero."));
  dataTable(viz,
    ["assay", "NF human files", "NF individuals", "ALS human files", "ALS individuals"],
    rows.map(r => [r.assay, String(r.nf), r.nfIndividuals, String(r.als), r.alsIndividuals]));
}, "assays");

/* =================== step 4: NF variant cohorts =================== */
const STORY_COHORT = "nst_nfosi_ntap"; // the study JH-2-002's calls come from
buildCard("card-4", "Run step 4 — show the four variant cohorts", Q.cohorts, (rows, viz) => {
  rows.forEach(r => {
    r.cohort = r.study.replace(/^cBioPortal study /, "");
    r.n = +r.observations;
  });
  rows.sort((a, b) => b.n - a.n);
  const max = Math.max(...rows.map(r => r.n));
  const sum = k => rows.reduce((s, r) => s + Number(r[k]), 0);
  resultMetrics(viz, [
    [sum("individuals"), "Individuals"],
    [sum("specimens"), "Specimens"],
    [sum("observations"), "Variant calls"],
  ]);

  viz.appendChild(el("p", "viz-title",
    "Somatic variant calls by study cohort"));
  viz.appendChild(el("p", "viz-sub",
    "These calls come from four study cohorts and include small variants classified " +
    "as SNP, insertion, or deletion. Structural variants and copy number changes are " +
    "outside the scope of this view."));
  const t = el("table", "data");
  const h = el("tr");
  ["cohort", "individuals", "specimens", "distinct variants", "calls", "variant types"]
    .forEach(x => h.appendChild(el("th", null, x)));
  const thead = el("thead"); thead.appendChild(h); t.appendChild(thead);
  const tb = el("tbody");
  for (const r of rows) {
    const hot = r.cohort === STORY_COHORT;
    const tr = el("tr");
    const td1 = el("td");
    const plain = el("span", "plain mono", r.cohort);
    if (hot) plain.style.fontWeight = "650";
    td1.appendChild(plain);
    if (hot) {
      const pill = el("span", "gbadge on", "JH-2-002’s cohort");
      pill.style.marginLeft = "8px";
      td1.appendChild(pill);
    }
    tr.appendChild(td1);
    tr.appendChild(el("td", null, Number(r.individuals).toLocaleString()));
    tr.appendChild(el("td", null, Number(r.specimens).toLocaleString()));
    tr.appendChild(el("td", null, Number(r.variants).toLocaleString()));
    const tdc = el("td", null);
    tdc.appendChild(el("div", null, r.n.toLocaleString()));
    const bar = el("div", "callsbar" + (hot ? " hot" : ""));
    bar.style.width = (r.n / max * 100) + "%";
    tdc.appendChild(bar);
    tr.appendChild(tdc);
    tr.appendChild(el("td", null, r.variantTypes.split(" | ").join(" · ")));
    bindTip(tr, () => [
      [r.n.toLocaleString() + " calls", r.cohort],
      [Number(r.individuals).toLocaleString() + " individuals, " +
       Number(r.specimens).toLocaleString() + " specimens", "cohort size"],
      [r.variantTypes.split(" | ").join(" · "), "variant types observed"],
    ]);
    tb.appendChild(tr);
  }
  t.appendChild(tb); viz.appendChild(t);
  const leg = el("div", "legend");
  const k1 = el("span"); const s1 = el("span", "key"); s1.style.background = "var(--accent)";
  k1.append(s1, document.createTextNode("JH-2-002’s cohort"));
  const k2 = el("span"); const s2 = el("span", "key"); s2.style.background = "var(--ctx)";
  k2.append(s2, document.createTextNode("the other three variant cohorts"));
  leg.append(k1, k2); viz.appendChild(leg);
  viz.appendChild(el("p", "mech-note",
    "The nfib cohort has the most calls and includes ten individuals. JH-2-002 " +
    "belongs to the nst cohort, which is examined in the next step."));
  dataTable(viz, ["cohort", "individuals", "specimens", "distinct variants", "calls", "variant types"],
    rows.map(r => [r.cohort, r.individuals, r.specimens, r.variants, r.observations, r.variantTypes]));
}, "cohorts");

/* =================== step 5: progression matrix =================== */
buildCard("card-5", "Run step 5 — find this patient’s variants", Q.progressionDetail, (rows, viz) => {
  // shape: unique alleles (symbol+change) x unique specimens
  const alleles = [];
  const specs = new Map(); // specimenID -> tumorTypes set
  const hit = new Map();   // alleleKey -> Set(specimenID)
  for (const r of rows) {
    const key = r.symbol + " " + (r.change || r.vrs);
    if (!alleles.some(a => a.key === key)) alleles.push({ key, symbol: r.symbol, change: r.change || "", vrs: r.vrs });
    if (!specs.has(r.specimenID)) specs.set(r.specimenID, new Set());
    if (r.tumorType) specs.get(r.specimenID).add(r.tumorType);
    if (!hit.has(key)) hit.set(key, new Set());
    hit.get(key).add(r.specimenID);
  }
  // order columns: plexiform first, then MPNST (transformation reads left->right)
  const isM = s => [...(specs.get(s) || [])].some(t => /malignant peripheral/i.test(t));
  const cols = [...specs.keys()].sort((a, b) => (isM(a) - isM(b)) || a.localeCompare(b));
  alleles.sort((a, b) => hit.get(b.key).size - hit.get(a.key).size);
  resultMetrics(viz, [[cols.length, "Tumour specimens"], [alleles.length, "Variants shown"]]);

  viz.appendChild(el("p", "viz-title", "DNA changes × tumours sampled"));
  viz.appendChild(el("p", "viz-sub",
    "A filled cell indicates that the variant was found in the tumour specimen. " +
    "Benign specimens appear before malignant specimens. Hover for specimen and variant details."));
  const table = el("table", "matrix");
  // group header row
  const g = el("tr");
  g.appendChild(el("th"));
  let i = 0;
  while (i < cols.length) {
    const grp = isM(cols[i]) ? "MPNST" : "plexiform / nodular";
    let span = 0, j = i;
    while (j < cols.length && (isM(cols[j]) ? "MPNST" : "plexiform / nodular") === grp) { span++; j++; }
    const th = el("th", "grouphead", grp); th.colSpan = span;
    g.appendChild(th); i = j;
  }
  table.appendChild(g);
  const h = el("tr");
  h.appendChild(el("th"));
  cols.forEach(c => h.appendChild(el("th", "coltop", c)));
  table.appendChild(h);
  for (const a of alleles) {
    const tr = el("tr");
    const rh = el("td", "rowhead");
    rh.appendChild(el("strong", null, a.symbol + " "));
    rh.appendChild(el("span", null, a.change));
    rh.appendChild(el("br"));
    rh.appendChild(el("span", "mono", a.vrs.slice(0, 26) + "…"));
    tr.appendChild(rh);
    for (const c of cols) {
      const on = hit.get(a.key).has(c);
      const group = isM(c) ? "malignant" : "benign";
      const td = el("td", "cell" + (on ? " on " + group : ""));
      td.tabIndex = 0;
      const tumour = [...(specs.get(c) || [])].join(", ") || "specimen";
      const rowsTip = [
        [a.symbol + " " + a.change, on ? "observed" : "not observed"],
        [c, tumour],
        [a.vrs, "VRS identifier"],
      ];
      td.setAttribute("aria-label",
        `${a.symbol} ${a.change}, ${on ? "observed" : "not observed"} in ${c} (${tumour})`);
      bindTip(td, () => rowsTip);
      td.addEventListener("focus", () => { const r = td.getBoundingClientRect(); showTip({clientX: r.right, clientY: r.top}, rowsTip); });
      td.addEventListener("blur", hideTip);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  viz.appendChild(table);
  dataTable(viz, ["specimen", "gene", "change", "VRS", "tumor type(s)"],
    rows.map(r => [r.specimenID, r.symbol, r.change || "", r.vrs, r.tumorType || ""]));
}, "progression");

/* =================== step 6: screening bars =================== */
const STORY_DRUGS = /trametinib|tno155|ribociclib|selumetinib|mirdametinib/i;
/* Open Targets uses each molecule's preferred name; the audience heard TNO155 in
   step 2, so carry the familiar name alongside it. Raw labels stay in the table. */
const DISPLAY_NAME = { "BATOPROTAFIB": "batoprotafib (TNO155)" };
const drugName = d => DISPLAY_NAME[d] || d.toLowerCase();
/* Clinical stage enums, rendered readably. PHASE_1_2 must not read "phase 1 2". */
const STAGE_LABEL = {
  EARLY_PHASE_1: "early phase 1", PHASE_1: "phase 1", PHASE_1_2: "phase 1/2",
  PHASE_2: "phase 2", PHASE_2_3: "phase 2/3", PHASE_3: "phase 3", APPROVAL: "approved",
};
const stageLabel = s => STAGE_LABEL[s] || s.replaceAll("_", " ").toLowerCase();
buildCard("card-6", "Run step 6 — find drugs screened on their cells", Q.screening, (rows, viz) => {
  rows.forEach(r => r.n = +r.files);
  rows.sort((a, b) => b.n - a.n);
  const top = rows.slice(0, 14);
  const rest = rows.slice(14);
  const restFiles = rest.reduce((s, r) => s + r.n, 0);
  const max = Math.max(...top.map(r => r.n));

  viz.appendChild(el("p", "viz-title",
    "Drug screening files by compound — " + rows.length + " compounds linked to this patient"));
  viz.appendChild(el("p", "viz-sub",
    "Each row shows a screened compound and its file count. The ChEMBL identifier " +
    "beneath the name links that compound to Open Targets data."));
  const grid = el("div", "barlist");
  for (const r of top) {
    const hot = STORY_DRUGS.test(r.compoundName || "");
    const chembl = (r.compound || "").split("/").pop();
    const lab = el("div", "bar-label");
    // plain name leads; the identifier sits under it (B1/A5)
    if (r.compoundName) {
      lab.appendChild(el("span", "plain", r.compoundName));
      lab.appendChild(el("br"));
      lab.appendChild(el("span", "raw", chembl));
    } else {
      lab.appendChild(el("span", "plain", chembl));
      lab.appendChild(el("br"));
      lab.appendChild(el("span", "raw", "compound name unavailable"));
    }
    const track = el("div", "bar-track");
    const bar = el("div", "bar" + (hot ? " hot" : ""));
    bar.style.width = (r.n / max * 100) + "%";
    track.appendChild(bar);
    const val = el("div", "bar-val", String(r.n));
    const tipRows = () => [
      [String(r.n) + " files", r.compoundName || chembl],
      [chembl, "ChEMBL identifier"],
      [r.specimens || "", "specimens"],
    ];
    for (const elm of [lab, track, val]) bindTip(elm, tipRows);
    grid.append(lab, track, val);
  }
  viz.appendChild(grid);
  if (rest.length) viz.appendChild(el("p", "viz-sub",
    `${rest.length} additional compounds across ${restFiles} files. View the full table below.`));
  const leg = el("div", "legend");
  const k1 = el("span"); const s1 = el("span", "key"); s1.style.background = "var(--accent)";
  k1.append(s1, document.createTextNode("compounds discussed in later steps"));
  const k2 = el("span"); const s2 = el("span", "key"); s2.style.background = "var(--ctx)";
  k2.append(s2, document.createTextNode("other screened compounds"));
  leg.append(k1, k2); viz.appendChild(leg);
  dataTable(viz, ["ChEMBL", "recorded compound name", "files", "specimens"],
    rows.map(r => [(r.compound || "").split("/").pop(), r.compoundName || "", String(r.n), r.specimens || ""]));
}, "screening");

/* =================== step 7: mechanism link diagram =================== */
buildCard("card-7", "Run step 7 — connect those drugs to NF1’s pathway", Q.mechanism, (rows, viz) => {
  // default: single-protein edges only (the graph's own counting rule);
  const single = rows.filter(r => r.targetType === "single protein");
  /* two lanes per row: pathways shared with NF1, and autophagy pathways shared
     with an ALS gene. A row can sit in either, both, or neither. */
  const lane = (r, k) => (r[k] || "").split(" | ").filter(Boolean);
  const nfOf  = r => lane(r, "sharedPathways");
  const alsOf = r => lane(r, "alsPathways");
  const shown = single.filter(r => nfOf(r).length || alsOf(r).length);
  const noPw = single.filter(r => !nfOf(r).length && !alsOf(r).length);
  const alsRows = shown.filter(r => alsOf(r).length);

  viz.appendChild(el("p", "viz-title", "Screened compounds, protein targets, and shared pathways"));
  viz.appendChild(el("p", "viz-sub",
    "Lines connect screened compounds to individual protein targets, then to pathways " +
    "shared with NF1 (blue) or genes associated with ALS (orange). Broad pathway " +
    "categories are excluded to keep the relationships specific. Open Targets lists " +
    "TNO155 under its preferred name, batoprotafib."));

  const isHotDrug = d => STORY_DRUGS.test(d) || d === "BATOPROTAFIB";
  /* a drug reached only through the ALS lane sorts to the bottom, so the diagram
     reads canonical-NF-story at the top and the other-disease lane underneath */
  const alsOnlyDrug = new Set(
    [...new Set(alsRows.map(r => r.drug))].filter(
      d => !shown.some(r => r.drug === d && nfOf(r).length)));
  const drugs = [...new Set(shown.map(r => r.drug))].sort((a, b) => {
    const ha = isHotDrug(a), hb = isHotDrug(b);
    const aa = alsOnlyDrug.has(a), ab = alsOnlyDrug.has(b);
    return (hb - ha) || (aa - ab) || a.localeCompare(b);
  });
  const alsOnlyTarget = new Set(
    [...new Set(alsRows.map(r => r.targetSymbol))].filter(
      t => !shown.some(r => r.targetSymbol === t && nfOf(r).length)));
  const targets = [...new Set(shown.map(r => r.targetSymbol))].sort((a, b) => {
    const ma = /^MAP2K/.test(a), mb = /^MAP2K/.test(b);
    const aa = alsOnlyTarget.has(a), ab = alsOnlyTarget.has(b);
    return (mb - ma) || (aa - ab) || a.localeCompare(b);
  });
  /* NF1 pathways first, then the ALS-lane ones, so each lane is a block */
  const pwCount = new Map(), alsPwCount = new Map();
  shown.forEach(r => {
    nfOf(r).forEach(p => pwCount.set(p, (pwCount.get(p) || 0) + 1));
    alsOf(r).forEach(p => alsPwCount.set(p, (alsPwCount.get(p) || 0) + 1));
  });
  const nfPathways = [...pwCount.keys()].sort((a, b) => pwCount.get(b) - pwCount.get(a));
  const alsPathways = [...alsPwCount.keys()]
    .filter(p => !pwCount.has(p))
    .sort((a, b) => alsPwCount.get(b) - alsPwCount.get(a));
  const pathways = [...nfPathways, ...alsPathways];

  const rowH = 26, headH = 34;
  const H = headH + Math.max(drugs.length, targets.length, pathways.length) * rowH + 10;
  const xD = 10, xT = 380, xP = 560, chipW = 150;
  /* Kept short on purpose: a header long enough to name both lanes pushes the
     canvas past the card and gets clipped by the scroll box. The legend names
     them instead, which is where identity belongs anyway. */
  const PW_HEAD = "SHARED PATHWAY (REACTOME)";
  // size the canvas to the longest pathway name and to the column head itself,
  // so neither the evidence nor its label is ever clipped (B5). The head is
  // 12px semibold and letter-spaced, so it runs ~7.4px per character.
  const longest = Math.max(PW_HEAD.length * 7.4 / 6.4, ...pathways.map(p => p.length));
  const W = Math.max(900, xP + longest * 6.4 + 16);
  const yOf = (list, name) => headH + list.indexOf(name) * rowH + rowH / 2;
  const NS = "http://www.w3.org/2000/svg";
  const wrap = el("div", "mech-wrap");
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "mech-svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W); svg.setAttribute("height", H);

  const hotTargets = new Set(shown.filter(r => isHotDrug(r.drug) && nfOf(r).length)
                                  .map(r => r.targetSymbol));
  const hotPw = new Set();
  shown.filter(r => isHotDrug(r.drug)).forEach(r => nfOf(r).forEach(p => hotPw.add(p)));

  function colhead(x, text) {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", x); t.setAttribute("y", 16);
    t.setAttribute("class", "mech-colhead"); t.textContent = text;
    svg.appendChild(t);
  }
  colhead(xD, "DRUG SCREENED ON THESE CELLS");
  colhead(xT, "PROTEIN IT ACTS ON");
  colhead(xP, PW_HEAD);

  /* Ribbons, drawn once per edge: drug -> protein, and protein -> pathway with
     its width set by how many screened drugs reach the pathway through that
     protein. Each ribbon remembers the drugs, proteins and pathways behind it,
     so hovering any label keeps that label's routes and dims the rest. */
  const LANE_RANK = { ctx: 0, hot: 1, als: 2 };   // context underneath, lanes on top
  const edges = new Map();  // key -> { d, lane, drugs:Set, nodes:Set }
  function edge(key, d, lane, drug, nodes) {
    if (!edges.has(key)) edges.set(key, { d, lane, drugs: new Set(), nodes: new Set() });
    const e = edges.get(key);
    if (LANE_RANK[lane] > LANE_RANK[e.lane]) e.lane = lane;
    e.drugs.add(drug);
    nodes.forEach(n => e.nodes.add(n));
  }
  for (const r of shown) {
    const y1 = yOf(drugs, r.drug), y2 = yOf(targets, r.targetSymbol);
    const nf = nfOf(r), als = alsOf(r);
    const hot = isHotDrug(r.drug);
    const reach = ["d|" + r.drug, "t|" + r.targetSymbol, ...nf.concat(als).map(pw => "p|" + pw)];
    // drug -> protein. The NF1 lane owns this edge when the row has one.
    edge(`dt|${r.drug}|${r.targetSymbol}`,
         `M ${xD + chipW} ${y1} C ${xD + chipW + 90} ${y1}, ${xT - 100} ${y2}, ${xT - 8} ${y2}`,
         nf.length ? (hot ? "hot" : "ctx") : "als", r.drug, reach);
    const arc = y3 =>
      `M ${xT + 70} ${y2} C ${xT + 120} ${y2}, ${xP - 60} ${y3}, ${xP - 8} ${y3}`;
    for (const pw of nf)
      edge(`tp|${r.targetSymbol}|${pw}`, arc(yOf(pathways, pw)),
           hot && hotPw.has(pw) ? "hot" : "ctx", r.drug, ["d|" + r.drug, "t|" + r.targetSymbol, "p|" + pw]);
    for (const pw of als)
      edge(`tp|${r.targetSymbol}|${pw}`, arc(yOf(pathways, pw)),
           "als", r.drug, ["d|" + r.drug, "t|" + r.targetSymbol, "p|" + pw]);
  }
  const ribbons = [...edges.values()].sort((a, b) => LANE_RANK[a.lane] - LANE_RANK[b.lane]);
  for (const e of ribbons) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", e.d); p.setAttribute("class", "mech-link " + e.lane);
    p.style.strokeWidth = ribbonWidth(e.drugs.size) + "px";
    svg.appendChild(p);
    e.el = p;
  }
  /* Chips wear text tokens, never the lane colour — the ribbons carry identity. */
  function chips(list, x, hotSet, kind, display) {
    for (const name of list) {
      const y = yOf(list, name);
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", x); t.setAttribute("y", y + 4);
      t.setAttribute("class", "mech-chip" + (hotSet.has(name) ? "" : " dim"));
      t.dataset.node = kind + "|" + name;
      t.textContent = display ? display(name) : name;
      t.addEventListener("pointerenter", () => {
        svg.classList.add("focus");
        for (const e of ribbons) e.el.classList.toggle("on", e.nodes.has(t.dataset.node));
      });
      t.addEventListener("pointerleave", () => {
        svg.classList.remove("focus");
        for (const e of ribbons) e.el.classList.remove("on");
      });
      svg.appendChild(t);
    }
  }
  chips(drugs, xD, new Set(drugs.filter(isHotDrug)), "d", drugName);
  chips(targets, xT, hotTargets, "t");      // gene/protein symbols stay upper case
  chips(pathways, xP, hotPw, "p");
  wrap.appendChild(svg); viz.appendChild(wrap);

  const legend = el("div", "legend");
  const keys = [
    ["var(--accent)", "selected compounds targeting proteins in NF1 pathways"],
    ["var(--ctx)", "other screened compounds with targets in NF1 pathways"],
  ];
  if (alsRows.length)
    keys.push(["var(--series-2)",
      "target shares an autophagy pathway with an ALS-associated gene"]);
  for (const [colour, label] of keys) {
    const k = el("span"); const sw = el("span", "key line"); sw.style.background = colour;
    k.append(sw, document.createTextNode(label));
    legend.appendChild(k);
  }
  viz.appendChild(legend);

  /* The second lane, stated with its own limits. This is the "same drugs, other
     disease" point, and it is the one place the demo reaches outside NF. */
  if (alsRows.length) {
    const pairs = [...new Set(alsRows.map(r => `${drugName(r.drug)} → ${r.targetSymbol}`))];
    const genes = [...new Set(alsRows.flatMap(r => lane(r, "alsGenes")))].sort();
    const note = el("p", "mech-note");
    note.appendChild(el("strong", null, "ALS-associated pathways: "));
    note.appendChild(document.createTextNode(
      `${pairs.join(" · ")} have targets in ${alsPathways.join(", ")}, ` +
      `pathways also associated with ${genes.join(", ")}. ` +
      "These genes were matched in Reactome. A shared pathway does not establish " +
      "that a drug affects ALS."));
    viz.appendChild(note);
  }

  if (noPw.length) {
    const names = [...new Set(noPw.map(r => `${drugName(r.drug)} → ${r.targetSymbol}`))];
    const note = el("p", "mech-note");
    note.appendChild(el("strong", null, "Targets without a pathway match in this analysis: "));
    note.appendChild(document.createTextNode(names.join(" · ") +
      ". Ribociclib targets CDK4 and CDK6 and was also screened in combination with TNO155."));
    viz.appendChild(note);
  }
  dataTable(viz,
    ["drug", "action", "target", "target type", "shared with NF1", "shared with ALS genes", "ALS genes"],
    rows.map(r => [r.drug, r.action, r.targetSymbol, r.targetType,
                   r.sharedPathways || "", r.alsPathways || "", r.alsGenes || ""]));
}, "mechanism");

/* =================== step 8: stage dot matrix =================== */
const STAGE_ORDER = ["EARLY_PHASE_1", "PHASE_1", "PHASE_1_2", "PHASE_2", "PHASE_2_3", "PHASE_3", "APPROVAL"];
/* the precise term stays reachable, in the legend and the hover (B1) */
const DISEASE_ID = {
  "plexiform neurofibroma": "EFO_0000658",
  "malignant peripheral nerve sheath tumor": "MONDO_0017827",
};
buildCard("card-8", "Run step 8 — check regulatory status", Q.indication, (rows, viz) => {
  const stages = STAGE_ORDER.filter(s => rows.some(r => r.stage === s));
  rows.forEach(r => { if (!stages.includes(r.stage)) stages.push(r.stage); });
  const diseases = [...new Set(rows.map(r => r.disease))].sort();
  const sOf = d => /plexiform/i.test(d) ? "s1" : "s2";
  const best = new Map(); // drug -> max stage idx (for row order)
  rows.forEach(r => {
    const i = stages.indexOf(r.stage);
    best.set(r.drug, Math.max(best.get(r.drug) ?? -1, i));
  });
  const drugs = [...best.keys()].sort((a, b) => (best.get(b) - best.get(a)) || a.localeCompare(b));

  viz.appendChild(el("p", "viz-title", "Highest reported clinical stage by drug and tumour type"));
  viz.appendChild(el("p", "viz-sub",
    "Each dot shows the highest reported stage for one drug and tumour type. " +
    "Approval applies to a specific indication, shown in the legend."));
  const t = el("table", "stagegrid");
  const h = el("tr"); h.appendChild(el("th"));
  stages.forEach(s => {
    const th = el("th", s === "APPROVAL" ? "approval" : "", stageLabel(s));
    h.appendChild(th);
  });
  const thead = el("thead"); thead.appendChild(h); t.appendChild(thead);
  const tb = el("tbody");
  for (const d of drugs) {
    const tr = el("tr");
    tr.appendChild(el("td", "drug", drugName(d)));
    for (const s of stages) {
      const td = el("td", "slot" + (s === "APPROVAL" ? " approval-col" : ""));
      const here = rows.filter(r => r.drug === d && r.stage === s);
      for (const r of here) {
        const dot = el("span", "dot " + sOf(r.disease));
        dot.tabIndex = 0;
        const tipRows = [[stageLabel(r.stage), drugName(r.drug)],
                         [r.disease, DISEASE_ID[r.disease] || "indication"]];
        dot.setAttribute("aria-label",
          `${drugName(r.drug)}, ${r.disease}: ${stageLabel(r.stage)}`);
        dot.addEventListener("focus", () => { const b = dot.getBoundingClientRect(); showTip({clientX: b.right, clientY: b.top}, tipRows); });
        dot.addEventListener("blur", hideTip);
        dot.style.marginInline = "2px";
        td.appendChild(dot);
      }
      // D5: the 84x30 cell is the hit target, not the 12px dot
      if (here.length) {
        bindTip(td, () => here.flatMap(r => [
          [stageLabel(r.stage), drugName(r.drug)],
          [r.disease, DISEASE_ID[r.disease] || "indication"],
        ]));
      }
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
  t.appendChild(tb); viz.appendChild(t);
  // C6: the punchline, on the chart that shows it
  const punch = el("p", "mech-note");
  punch.appendChild(document.createTextNode(
    "Mirdametinib and selumetinib are listed as approved for plexiform neurofibroma. " +
    "Trametinib, which appears in this patient’s screening records, is listed at phase 2 " +
    "for the same tumour type."));
  viz.appendChild(punch);

  const leg = el("div", "legend");
  for (const d of diseases) {
    const k = el("span"); const sw = el("span", "key");
    sw.style.background = sOf(d) === "s1" ? "var(--accent)" : "var(--series-2)";
    sw.style.borderRadius = "50%";
    k.append(sw, document.createTextNode(
      DISEASE_ID[d] ? `${d} · ${DISEASE_ID[d]}` : d));
    leg.appendChild(k);
  }
  viz.appendChild(leg);
  viz.appendChild(el("p", "viz-sub",
    "This chart covers only the two tumour types recorded for this patient; it does " +
    "not show indications for neurofibromatosis type 1 more broadly."));
  dataTable(viz, ["drug", "disease", "max clinical stage"],
    rows.map(r => [r.drug, r.disease, r.stage]));
}, "indication");

