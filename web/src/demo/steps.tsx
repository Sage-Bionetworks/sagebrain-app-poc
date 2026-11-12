/* Step metadata and copy, ported from the demo's markup and STEPS/SPINE tables. */
import type { ReactNode } from "react";

export const STEPS = [
  { title: "Data sources",          scope: "selected releases" },
  { title: "Three portals",         scope: "ALS + CCKP + NF" },
  { title: "Estimated harmonization", scope: "ALS + CCKP + NF" },
  { title: "Cross-portal cohorts",  scope: "ALS + NF" },
  { title: "Variant cohorts",       scope: "NF" },
  { title: "Genotype",              scope: "NF" },
  { title: "Drug screening",        scope: "NF" },
  { title: "Drug targets and pathways", scope: "NF + Open Targets + Reactome" },
  { title: "Regulatory status",     scope: "NF + Open Targets" },
];

/** Rail group headings, keyed by the first step in the group. */
export const PHASES: Record<number, string> = { 0: "Explore data", 4: "Follow the patient" };

export const SPINE = [
  { label: "five sources",   sub: "selected releases",     precise: "ALS, CCKP, NF, Open Targets, and Reactome" },
  { label: "three portals",  sub: "ALS · CCKP · NF",       precise: "Comparable entities across three portals" },
  { label: "one assay",      sub: "RNA-seq, estimated",    precise: "RNA-seq datasets across three portals, harmonized by estimate" },
  { label: "two portals",    sub: "comparable cohorts",    precise: "Cohorts measured with the same assays in the ALS and NF portals" },
  { label: "one portal",     sub: "4 variant cohorts",     precise: "Somatic variant calls from four NF study cohorts" },
  { label: "one patient",    sub: "JH-2-002",              precise: "Genetic findings for one individual in the NF Data Portal" },
  { label: "patient cell line", sub: "JH-2-002-CL",        precise: "Drug screening data linked to a patient-derived cell line" },
  { label: "drug targets",   sub: "shared pathways",       precise: "Drug targets and biological pathways" },
  { label: "clinical stage", sub: "by tumour type",        precise: "Clinical stage for each drug and tumour type" },
];

/** Which spine edges each step completes (edge i = node i -> i+1). */
export const STEP_EDGES: Record<number, number[]> = { 1: [0], 2: [1], 3: [2], 4: [3], 5: [4], 6: [5], 7: [6], 8: [7] };

export const DATASETS = {
  nf: "NF Portal", als: "ALS Portal", cckp: "CCKP",
  ot: "Open Targets", reactome: "Reactome",
} as const;
export type DatasetKey = keyof typeof DATASETS;

export interface StepCopy {
  eyebrow: string;
  heading: string;
  claim: ReactNode;
  scope: DatasetKey[];
  note: ReactNode;
}

/** Steps 1–8 (step 0, setup, is laid out separately in DemoTab). */
export const STEP_COPY: Record<number, StepCopy> = {
  1: {
    eyebrow: "step 1 · three portals",
    heading: "Data available across three portals",
    claim: <>The ALS, CCKP, and NF portals use a shared <strong>Biolink</strong> vocabulary,
      allowing the same entities to be compared across portals. The entities available vary by portal.</>,
    scope: ["nf", "als", "cckp"],
    note: <>In these selected releases, CCKP includes 1,130 datasets and 4,773 publications. NF
      includes 4,866 individuals and 8,501 specimens. ALS includes 25 datasets. Blank cells
      indicate entities absent from the selected portal data.</>,
  },
  2: {
    eyebrow: "step 2 · estimated harmonization",
    heading: "RNA-seq datasets across three portals",
    claim: <>Each portal labels its own data. Treating “RNA-seq” and “RNA Sequencing” as the same
      assay finds <strong>526 RNA-seq datasets</strong> across the three portals. Grouping related
      tissue and disease terms shows <strong>blood</strong> and the <strong>central nervous
      system</strong> in all three.</>,
    scope: ["nf", "als", "cckp"],
    note: <>This is an estimate: the labels and term groups are matched for this demo, not by the
      portals. NF has 36 RNA-seq datasets, CCKP 482, and ALS 8. Most CCKP RNA-seq datasets do not
      share a tissue or disease group with another portal.</>,
  },
  3: {
    eyebrow: "step 3 · two portals",
    heading: "Comparable cohorts across two portals",
    claim: <>The ALS and NF portals record <strong>five of the same assays</strong>, so their
      cohorts can be compared directly. Human RNA-seq data covers <strong>1,284 people in NF and
      424 in ALS</strong>.</>,
    scope: ["nf", "als"],
    note: <>The shared assays are RNA-seq, whole genome sequencing, ChIP-seq, ATAC-seq, and
      immunoassay. Counts include human files only. A zero people count can mean that files lack a
      person identifier.</>,
  },
  4: {
    eyebrow: "step 4 · one portal",
    heading: "NF variant data: 620,565 somatic variant calls",
    claim: <>The NF portal data layer includes small variant calls from <strong>four study
      cohorts</strong>. Patient JH-2-002 is among the 101 individuals represented in these cohorts.</>,
    scope: ["nf"],
    note: <>The four cohorts contain calls classified as SNP, insertion, or deletion. JH-2-002
      belongs to the nst cohort.</>,
  },
  5: {
    eyebrow: "step 5 · genotype",
    heading: "Genetic findings across one patient’s tumours",
    claim: <>Four tumour specimens from this patient were sequenced. <strong>NF1
      p.F2083Pfs*15</strong> was found in all four; <strong>SUZ12 p.Q424*</strong> was found in the
      two malignant specimens; variants are represented using GA4GH VRS identifiers.</>,
    scope: ["nf"],
    note: <>The NF1 variant appears in all four specimens. The SUZ12 variant appears in the two
      malignant peripheral nerve sheath tumours.</>,
  },
  6: {
    eyebrow: "step 6 · model and screening",
    heading: "Drug screening data for patient-derived cells",
    claim: <>A cell line linked to this patient has drug screening data. ChEMBL identifiers connect
      the screened compounds to information in Open Targets.</>,
    scope: ["nf"],
    note: <>The selected data includes 35 compounds across five linked specimens, including
      trametinib, TNO155, and ribociclib.</>,
  },
  7: {
    eyebrow: "step 7 · mechanism and pathway",
    heading: "Drug targets and shared pathways",
    claim: <>Several screened drugs act on <strong>MAP2K1 and MAP2K2</strong>, proteins in pathways
      that also include NF1, such as the <strong>RAF/MAP kinase cascade</strong>. The same analysis
      finds autophagy pathways shared by targets of other screened drugs and genes associated with{" "}
      <strong>ALS</strong>. A shared pathway suggests a connection for further study; it does not
      establish a drug effect.</>,
    scope: ["nf", "ot", "reactome"],
    note: <>Trametinib, selumetinib, and mirdametinib target MAP2K1/MAP2K2; batoprotafib (TNO155)
      targets PTPN11. Vorinostat and sapanisertib have targets in autophagy pathways shared with
      genes associated with ALS. The ALS gene comparison uses Reactome gene symbols.</>,
  },
  8: {
    eyebrow: "step 8 · regulatory status",
    heading: "Clinical stage by drug and tumour type",
    claim: <>The chart shows reported clinical stages for drugs associated with <strong>plexiform
      neurofibroma</strong> and <strong>malignant peripheral nerve sheath tumour</strong>, the two
      tumour types recorded for this patient. Each dot represents one drug and tumour type.</>,
    scope: ["nf", "ot"],
    note: <>In the selected data, mirdametinib and selumetinib are approved for plexiform
      neurofibroma. Trametinib has reached phase 2 for that tumour type.</>,
  },
};
