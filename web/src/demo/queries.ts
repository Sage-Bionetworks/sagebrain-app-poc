/* Canned queries and pinned graph versions, ported verbatim from
   Sage_Brain demo-app-updates:demo/index.html (the source of truth for these
   queries — re-verify there before editing). Only change: the endpoint is
   derived from the configured API base URL. */
import { API_BASE_URL } from "../config";

export const CONFIG = {
  endpoint: `${API_BASE_URL}/query`,
  nf:       "urn:sagebrain:nf:2026-09-28",
  als:      "urn:sagebrain:als:2026-09-15",
  cckp:     "urn:sagebrain:cckp:2026-09-29",
  ot:       "urn:sagebrain:opentargets:2026-09-24",
  reactome: "urn:sagebrain:reactome:2026-09-22",
  individual: "JH-2-002",
  pollMs: 2500,
  timeoutMs: 90000,
};

export const PREFIXES = `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX nf: <http://nf-osi.github.com/terms#>
PREFIX biolink: <https://w3id.org/biolink/vocab/>
PREFIX obo: <http://purl.obolibrary.org/obo/>
PREFIX sb: <https://w3id.org/synapse/sagebrain#>
PREFIX void: <http://rdfs.org/ns/void#>
PREFIX pav: <http://purl.org/pav/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX alskp: <https://alskp.synapse.org/terms#>
`;

/* The ALS side of step 7 is anchored on a literature gene panel matched by
   symbol in Reactome. It is NOT read from the ALS portal graph: that snapshot
   publishes no gene entities yet (see step 1 -- only NF reaches below the file
   level), so there is nothing there to join on. Stated on the step itself. */
export const ALS_GENE_PANEL = [
  "SOD1", "TARDBP", "FUS", "C9orf72", "OPTN", "TBK1", "SQSTM1", "UBQLN2", "VCP",
  "PFN1", "NEK1", "KIF5A", "ANG", "ALS2", "SETX", "VAPB", "CHCHD10", "MATR3",
  "HNRNPA1",
];

/* Step 2's estimated harmonization. RNA-seq labels as the portals write them
   (compared lower-cased), and tissue/disease terms grouped under a shared
   UBERON (tissue) or MONDO (disease) ancestor. A term outside these groups
   stays ungrouped. */
export const RNASEQ_LABELS = ["RNA-seq", "RNA sequencing", "bulk RNA-seq"];
export const TERM_GROUPS = {
  tissue: {
    "blood": ["blood", "serum"],
    "central nervous system": ["brain", "brain tissue", "cerebellum", "cerebral cortex",
      "dorsolateral prefrontal cortex", "frontal cortex", "hippocampus", "lateral motor cortex",
      "medial motor cortex", "meninges", "motor cortex", "occipital cortex",
      "primary motor cortex", "sensory cortex", "spinal cord tissue", "spinal_cord",
      "temporal lobe cortex"],
    "peripheral nervous system": ["nerves", "peripheral nerves", "trigeminal nerve"],
    "skin of body": ["skin"],
    "bone marrow": ["bone marrow"],
    "spleen": ["spleen"],
  },
  disease: {
    "neurofibromatosis": ["lztr1-related schwannomatosis", "neurofibromatosis type 1",
      "nf2-related schwannomatosis", "schwannomatosis-nos"],
    "nerve sheath neoplasm": ["atypical neurofibroma", "cutaneous neurofibroma",
      "malignant peripheral nerve sheath tumor", "malignant peripheral nerve sheath tumor (mpnst)",
      "neurofibroma", "plexiform neurofibroma", "schwannoma"],
    "glioma": ["astrocytoma", "glioblastoma", "glioma", "high-grade glioma", "low-grade glioma",
      "malignant glioma"],
    "central nervous system neoplasm": ["brain neoplasm", "malignant brain neoplasm",
      "medulloblastoma", "meningioma"],
    "hematopoietic and lymphoid cell neoplasm": ["acute lymphoblastic leukemia",
      "acute monocytic leukemia", "acute myeloid leukemia", "acute promyelocytic leukemia",
      "b acute lymphoblastic leukemia", "b-cell non-hodgkin lymphoma",
      "chronic lymphocytic leukemia", "chronic myeloid leukemia", "diffuse large b-cell lymphoma",
      "follicular lymphoma", "hodgkin lymphoma", "juvenile myelomonocytic leukemia (jmml)",
      "leukemia", "lymphoid leukemia", "lymphoma", "multiple myeloma", "myeloid leukemia",
      "myeloid neoplasm", "non-hodgkin lymphoma", "plasmablastic lymphoma",
      "t acute lymphoblastic leukemia", "t-cell lymphoma"],
  },
};
export const TERM_GROUP_OF = new Map(Object.entries(TERM_GROUPS).flatMap(([facet, groups]) =>
  Object.entries(groups).flatMap(([group, terms]) => terms.map(t => [facet + "|" + t, group]))));

/* This file is self-contained and the source of truth for every canned query.
   The portal-arc queries (pinned, portals, assays, cohorts) were verified live
   against the pinned graphs on 2026-09-29 and the RNA-seq query on 2026-10-03;
   the patient-story (demo2-*) queries on 2026-09-28. */
export const Q = {
  /* Fast connection check: read each pinned graph's own provenance instead of
     counting ~85M triples across every graph. OT and Reactome declare
     void:triples + pav:version; the portal snapshots declare void:triples
     plus a build time (no pav:version), so the check reads both shapes and
     the app merges rows per graph. Confirms each graph exists AND carries its
     manifest, in ~1-2s. */
  pinned: `SELECT ?g ?triples ?version ?built WHERE {
  VALUES ?g { <${CONFIG.nf}> <${CONFIG.als}> <${CONFIG.cckp}> <${CONFIG.ot}> <${CONFIG.reactome}> }
  GRAPH ?g {
    { ?d void:triples ?triples . OPTIONAL { ?d pav:version ?version } }
    UNION
    { ?d prov:generatedAtTime ?built }
  }
}`,

  /* Step 1: the same Biolink classes counted across the three portal graphs.
     Absent (portal, class) pairs simply return no row -- the gaps are the
     coverage statement. */
  portals: `SELECT ?g ?class (COUNT(DISTINCT ?e) AS ?n) WHERE {
  VALUES ?g { <${CONFIG.nf}> <${CONFIG.als}> <${CONFIG.cckp}> }
  VALUES ?class { biolink:Dataset biolink:Study biolink:Publication
                  biolink:IndividualOrganism biolink:MaterialSample }
  GRAPH ?g { ?e a ?class }
} GROUP BY ?g ?class ORDER BY ?g ?class`,

  /* Step 2: RNA-seq datasets in all three portals, one row per dataset with
     its assay, tissue and disease values joined by " | ". NF records tissue on
     files, so an NF dataset takes the tissues of its parent study's files. The
     match is an IN test on the lower-cased label: on Neptune a VALUES join here
     matched unreliably. */
  rnaseq: `SELECT ?portal (IF(STRSTARTS(STR(?d), "https://www.synapse.org/Synapse:"),
                   STRAFTER(STR(?d), "Synapse:"), STR(?d)) AS ?dataset)
       (SAMPLE(?name) AS ?datasetName)
       (GROUP_CONCAT(DISTINCT ?a; separator=" | ") AS ?assays)
       (GROUP_CONCAT(DISTINCT ?t; separator=" | ") AS ?tissues)
       (GROUP_CONCAT(DISTINCT ?x; separator=" | ") AS ?diseases)
WHERE {
  {
    GRAPH <${CONFIG.cckp}> {
      ?d a biolink:Dataset . OPTIONAL { ?d <https://w3id.org/mc2-center/cckp-portal/datasetName> ?name }
      VALUES (?facet ?p) { ("assay" <https://w3id.org/mc2-center/cckp-portal/assay>)
                           ("tissue" <https://w3id.org/mc2-center/cckp-portal/tissue>)
                           ("disease" <https://w3id.org/mc2-center/cckp-portal/tumorType>) }
      ?d ?p ?value . BIND("cckp" AS ?portal)
    }
  } UNION {
    GRAPH <${CONFIG.als}> {
      ?d a biolink:Dataset . OPTIONAL { ?d alskp:name ?name }
      VALUES (?facet ?p) { ("assay" alskp:assay) ("tissue" alskp:biospecimenType)
                           ("tissue" alskp:CNSRegion) ("disease" alskp:disease) }
      ?d ?p ?value . BIND("als" AS ?portal)
    }
  } UNION {
    GRAPH <${CONFIG.nf}> {
      ?d a biolink:Dataset . OPTIONAL { ?d nf:name ?name }
      VALUES (?facet ?p) { ("assay" nf:measurementTechnique) ("assay" nf:assay)
                           ("disease" nf:diseaseFocus) ("disease" nf:manifestation) }
      ?d ?p ?value . BIND("nf" AS ?portal)
    }
  } UNION {
    GRAPH <${CONFIG.nf}> {
      ?d a biolink:Dataset ; nf:parentStudy ?study . OPTIONAL { ?d nf:name ?name }
      ?f a nf:File ; nf:parentStudy ?study ; nf:tissue ?value .
      BIND("nf" AS ?portal) BIND("tissue" AS ?facet)
    }
  }
  BIND(LCASE(STR(?value)) AS ?lv)
  BIND(IF(?facet = "assay" && ?lv IN (${RNASEQ_LABELS.map(l => JSON.stringify(l.toLowerCase())).join(", ")}), 1, ?unbound) AS ?hit)
  BIND(IF(?facet = "assay", ?value, ?unbound) AS ?a)
  BIND(IF(?facet = "tissue", ?value, ?unbound) AS ?t)
  BIND(IF(?facet = "disease", ?value, ?unbound) AS ?x)
}
GROUP BY ?portal ?d
HAVING (COUNT(?hit) >= 1)
ORDER BY ?portal ?datasetName`,

  /* Step 3: assays present in BOTH portals, matched on the exact label, counted
     in HUMAN files and distinct human PEOPLE per side -- the unit a cohort is
     actually built in. The inner selects run per graph; the join on ?assay is
     the intersection.

     Three things this query shape is load-bearing about:

     1. Species is constrained to Homo sapiens on BOTH sides, and it has to be
        read off the FILE: nf:Individual carries only a type, hasSpecimen and
        individualID -- no species -- so the organism's species is only ever
        recorded on its files. Without this NF counts model organisms as people:
        RNA-seq drops 1,514 -> 1,284 (182 mouse, 13 zebrafish) and immunoassay
        drops 8 -> 2, which was mostly mouse. ALS is already 100% human (no
        non-human value appears in it at all), so its constraint changes almost
        nothing -- it is there for symmetry and to stay honest if ALS ever loads
        model-organism data.

     2. ALS goes FIRST. Both orders return identical rows, but ALS is the small
        graph (10,777 files), so evaluating it first leaves ?assay bound to the
        ~16 ALS assays before NF's 572,241 files are touched. NF-first makes
        Neptune scan NF unconstrained: 30.7s vs 6.7s, measured.

     3. NF individuals are counted as individualID LITERALS, unioned over both
        routes a file has to a person -- the annotation on the file itself, and
        the specimen the file hangs off. Neither route alone is complete: before
        the species filter, the file annotation reached 1,487 people for RNA-seq
        and the specimen route 1,379, against 1,514 unioned. Counting the literal
        rather than the nf:Individual IRI is what keeps it cheap, and costs
        nothing in accuracy because every individualID on a file resolves to
        exactly one nf:Individual (checked per assay: 1487/1487, 305/305, 43/43,
        31/31, 8/8). */
  assays: `SELECT ?assay ?nfFiles ?nfIndividuals ?alsFiles ?alsIndividuals WHERE {
  { SELECT ?assay (COUNT(DISTINCT ?pf) AS ?alsFiles) (COUNT(DISTINCT ?subj) AS ?alsIndividuals)
    WHERE { GRAPH <${CONFIG.als}> {
      ?pf a alskp:PortalFile ; alskp:assay ?assay ; alskp:species "Homo sapiens" .
      OPTIONAL { ?pf alskp:globalSubjectId ?subj }
    } } GROUP BY ?assay }
  { SELECT ?assay (COUNT(DISTINCT ?f) AS ?nfFiles) (COUNT(DISTINCT ?iid) AS ?nfIndividuals)
    WHERE { GRAPH <${CONFIG.nf}> {
      ?f a nf:File ; nf:assay ?assay ; nf:species "Homo sapiens" .
      OPTIONAL {
        { ?f nf:individualID ?iid }
        UNION
        { ?spec nf:hasFile ?f ; nf:fromIndividual ?ind . ?ind nf:individualID ?iid }
      }
    } } GROUP BY ?assay }
} ORDER BY DESC(?nfFiles)`,

  /* Step 4: the four cBioPortal study cohorts behind NF's somatic variant
     calls. GROUP_CONCAT of nf:variantType is the small-variants-only proof:
     it only ever reads SNP / INS / DEL. Counts ~620k observations, so this is
     the slowest query in the demo (~25s). */
  cohorts: `SELECT ?study (COUNT(DISTINCT ?ind) AS ?individuals)
       (COUNT(DISTINCT ?spec) AS ?specimens)
       (COUNT(DISTINCT ?obs) AS ?observations)
       (COUNT(DISTINCT ?variant) AS ?variants)
       (GROUP_CONCAT(DISTINCT ?vt; separator=" | ") AS ?variantTypes) WHERE {
  GRAPH <${CONFIG.nf}> {
    ?obs a nf:VariantObservation ; nf:fromVariantDataset ?ds ; nf:observesVariant ?variant .
    ?ds rdfs:label ?study .
    OPTIONAL { ?obs nf:fromIndividual ?ind }
    OPTIONAL { ?obs nf:fromSpecimen ?spec }
    OPTIONAL { ?obs nf:variantType ?vt }
  }
} GROUP BY ?study ORDER BY ?study`,

  graphs: `SELECT ?g (COUNT(*) AS ?triples)
WHERE { GRAPH ?g { ?s ?p ?o } }
GROUP BY ?g ORDER BY DESC(?g)`,

  progressionDetail: `SELECT DISTINCT ?specimenID ?symbol ?change ?vrs ?tumorType
WHERE {
  GRAPH <${CONFIG.nf}> {
    VALUES ?symbol { "NF1" "NF2" "SUZ12" "EED" "TP53" "CDKN2A" }
    ?gene a biolink:Gene ; nf:geneSymbol ?symbol .
    ?obs nf:affectedGene ?gene ; nf:observesVariant ?variant ; nf:fromSpecimen ?specimen ;
         nf:fromIndividual ?individual ; nf:hasConsequence ?so .
    VALUES ?so {
      obo:SO_0001583 obo:SO_0001587 obo:SO_0001578 obo:SO_0001589
      obo:SO_0001822 obo:SO_0001821 obo:SO_0002012
    }
    FILTER(STRENDS(STR(?individual), "/${CONFIG.individual}"))
    ?variant nf:vrsId ?vrs .
    ?specimen nf:specimenID ?specimenID .
    OPTIONAL { ?obs nf:aminoacidChange ?change }
    OPTIONAL { ?specimen nf:hasFile ?f . ?f nf:tumorType ?tumorType }
  }
} ORDER BY ?symbol ?specimenID`,

  screening: `SELECT ?compound (SAMPLE(?name) AS ?compoundName)
       (COUNT(DISTINCT ?file) AS ?files)
       (GROUP_CONCAT(DISTINCT ?sid; separator=" | ") AS ?specimens)
WHERE {
  GRAPH <${CONFIG.nf}> {
    ?specimen nf:fromIndividual ?individual ; nf:hasFile ?file .
    FILTER(STRENDS(STR(?individual), "/${CONFIG.individual}"))
    ?file nf:compound ?compound .
    OPTIONAL { ?file nf:compoundName ?name }
    OPTIONAL { ?file nf:specimenID ?sid }
  }
}
GROUP BY ?compound
ORDER BY DESC(?files)`,

  /* Two pathway lanes off the same drug list, so the diagram can show that the
     drugs are not hard-wired to one disease's story:
       ?sharedPathways -- pathways the target shares with NF1 (the canonical lane)
       ?alsPathways    -- autophagy pathways the target shares with an ALS gene
     The ALS lane is pre-aggregated per ?target in its own sub-SELECT. Done as a
     second bare OPTIONAL it cross-products against the NF1 lane and the query
     goes from ~5s to ~27s; pre-aggregated it returns one row per target and the
     whole query is faster than the single-lane version was.
     "phagy" catches the family (Autophagy, Macroautophagy, Selective autophagy,
     Aggrephagy) -- note Aggrephagy does not contain the string "autophagy". */
  mechanism: `SELECT ?drug ?action ?targetSymbol ?targetType ?alsPathways ?alsGenes
       (GROUP_CONCAT(DISTINCT ?pathwayLabel; separator=" | ") AS ?sharedPathways)
WHERE {
  {
    SELECT DISTINCT ?c WHERE {
      GRAPH <${CONFIG.nf}> {
        ?specimen nf:fromIndividual ?individual ; nf:hasFile ?file .
        FILTER(STRENDS(STR(?individual), "/${CONFIG.individual}"))
        ?file nf:compound ?c .
      }
    }
  }
  GRAPH <${CONFIG.ot}> {
    ?a a biolink:ChemicalAffectsGeneAssociation ;
       biolink:subject ?c ; biolink:object ?target ;
       sb:action_type ?action ; sb:target_type ?targetType .
    ?c rdfs:label ?drug .
    ?target rdfs:label ?targetSymbol .
  }
  OPTIONAL {
    GRAPH <${CONFIG.reactome}> {
      ?patientGene rdfs:label "NF1" ; sb:participates_in ?pw .
      ?target sb:participates_in ?pw .
      ?pw rdfs:label ?pathwayLabel .
      FILTER(?pathwayLabel NOT IN ("Disease", "Signal Transduction",
        "Diseases of signal transduction by growth factor receptors and second messengers"))
    }
  }
  OPTIONAL {
    SELECT ?target
           (GROUP_CONCAT(DISTINCT ?alsPathway; separator=" | ") AS ?alsPathways)
           (GROUP_CONCAT(DISTINCT ?alsSym;     separator=" | ") AS ?alsGenes)
    WHERE {
      GRAPH <${CONFIG.reactome}> {
        VALUES ?alsSym { ${ALS_GENE_PANEL.map(g => `"${g}"`).join(" ")} }
        ?alsGene rdfs:label ?alsSym ; sb:participates_in ?pwA .
        ?target sb:participates_in ?pwA .
        ?pwA rdfs:label ?alsPathway .
        FILTER(CONTAINS(LCASE(?alsPathway), "phagy"))
      }
    } GROUP BY ?target
  }
}
GROUP BY ?drug ?action ?targetSymbol ?targetType ?alsPathways ?alsGenes
ORDER BY ?drug ?targetSymbol`,

  indication: `SELECT DISTINCT ?drug ?disease ?stage
WHERE {
  {
    SELECT DISTINCT ?c WHERE {
      GRAPH <${CONFIG.nf}> {
        ?specimen nf:fromIndividual ?individual ; nf:hasFile ?file .
        FILTER(STRENDS(STR(?individual), "/${CONFIG.individual}"))
        ?file nf:compound ?c .
      }
    }
  }
  {
    SELECT DISTINCT ?tumorClass WHERE {
      GRAPH <${CONFIG.nf}> {
        ?patientFile nf:individualID ?iid ; nf:tumorClass ?tumorClass .
        FILTER(STR(?iid) = "${CONFIG.individual}")
      }
    }
  }
  GRAPH <${CONFIG.ot}> {
    ?a a biolink:ChemicalOrDrugOrTreatmentToDiseaseOrPhenotypicFeatureAssociation ;
       biolink:subject ?c ; biolink:object ?tumorClass ;
       sb:max_clinical_stage ?stage .
    ?c rdfs:label ?drug .
    ?tumorClass rdfs:label ?disease .
  }
}
ORDER BY ?drug ?disease`,
};
