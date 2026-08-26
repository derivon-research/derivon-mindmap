# Large-scale mathematics authoring

Use this workflow when revising or completing many concept and derivation
documents. Its purpose is to preserve textbook-level teaching quality when the
work is too large for one undifferentiated writing pass.

The protocol names roles and artifacts, not vendor APIs. A platform may call the
capability SubAgents, child agents, delegated tasks, parallel agents, workers, or
something else. Use only capabilities the current environment actually exposes.

## Non-negotiable ownership rules

- `document.md` remains the source of truth for every Markdown object. Publish
  `index.html` from it using the workspace renderer after the prose is accepted.
- The main Agent owns the inventory, work plan, shared-file writes, publication,
  graph-wide validation, and the final completion claim.
- Delegated Agents should return drafts and review reports, or write only inside
  isolated workspaces explicitly assigned to them. Do not let multiple Agents
  concurrently edit the same workspace files.
- Scripts may inventory, extract source material, render, compare, and audit.
  They must not contain chapter prose, lesson-sized text maps, or templates that
  bulk-author the documents. If such a generator already exists, do not run,
  extend, or treat its output as accepted teaching material.
- A page that exists, renders, or passes structural checks is not thereby a
  finished lesson. Coverage and quality are separate facts.

## 1. Establish the baseline

Inventory every in-scope concept and hyperedge together with its source and
publication files. Classify each page as one of:

- **Accepted exemplar:** explicitly approved by the user, or demonstrably at the
  user-approved level after close comparison. Length alone never qualifies it.
- **Provisional draft:** present but not yet shown to meet that bar. Treat prior
  bulk-generated pages as provisional even if they are syntactically complete.
- **Missing:** absent, empty, placeholder-only, or unusable.

Also inspect `.derivon/` and nearby tooling for scripts or data modules that
duplicate lesson prose. Record them as provenance risks. Preserve them unless
the user asks for removal, but never continue that authoring pattern.

Choose a few accepted exemplars that represent the needed document types, such
as one concept with a strong interactive visualization and one fully narrated
derivation. Extract their useful qualities rather than copying their headings or
surface style. If there is no accepted exemplar, complete and review a small
pilot cluster before scaling.

Maintain one progress ledger owned by the main Agent, using persistent task state
when the platform provides it or a task-local work log otherwise. For every page,
record its source packet, writer and reviewer (when delegated), current
classification, unresolved findings, publication state, and audit result. This
ledger is coordination metadata, never a substitute for lesson content or a
second source of truth. Delegated Agents may report updates; only the main Agent
changes the ledger.

## 2. Build source packets before drafting

Do not ask a writer to reconstruct a chapter from a title or graph label. For
each teaching cluster, prepare a bounded source packet containing:

- the target concept and its direct prerequisites;
- the owning and adjacent hyperedges needed to understand the teaching role;
- the exact textbook sections, definitions, results, examples, exercises, or
  user-authored material that govern the content;
- the relevant accepted exemplars;
- notation, audience assumptions, source-fidelity requirements, and known gaps;
- the output documents and the acceptance criteria that apply to each one.

When the user requires the graph to replace reading the textbook, the packet
must include every source passage needed to teach the scoped material. A source
summary that omits the motivation, worked example, or intermediate reasoning is
not enough. Preserve strong textbook examples and proof routes when they teach
the idea well; adapt accurately and identify their location when useful.

## 3. Form pedagogical work units

Group work by a coherent learning obstacle, not by an arbitrary list of paths.
A useful cluster normally contains a target concept, its direct prerequisites,
the derivations that establish or use it, and the exact source material for that
local story. Keep clusters small enough that one writer can hold the whole
dependency picture and finish every assigned page at exemplar quality.

Do not blindly assign one Agent per document. Separate pages only when they are
truly independent; keep a concept and its tightly coupled derivation together so
notation, assumptions, and examples remain consistent.

## 4. Select the execution mode

At the start of a large task, inspect the available Agent capabilities.

**When delegation is available:** use it for independent, bounded work such as
source extraction, cluster drafting, and review. Give each delegated Agent the
source packet and a concrete deliverable. Parallelize only clusters that do not
share files or unsettled notation. The main Agent remains responsible for
reconciling cross-cluster terminology and integrating changes serially.

**When delegation is unavailable:** run the same roles sequentially. Complete
one bounded cluster, clear the drafting context as much as the platform permits,
review it from the stated acceptance criteria, integrate it, and only then move
to the next cluster. Do not compensate with larger batches, thinner prose, or a
bulk template.

Capability availability changes scheduling, not standards. Never mention a
vendor-specific tool in portable instructions unless the current platform
requires it for execution.

## 5. Give delegated work a real contract

A drafting assignment must state:

- which cluster and exact files are in scope;
- which graph neighbors must be read together;
- which sources and exemplars are authoritative;
- what the reader already knows and what remains to be established;
- which concept and derivation acceptance criteria apply;
- whether an interactive component is pedagogically warranted;
- whether the Agent returns a draft, a patch from an isolated workspace, or a
  review report, and that it must not edit shared files outside its assignment.

Ask research Agents for evidence packets, not lesson prose. Ask writing Agents
for complete lessons, not outlines or filler awaiting another pass. Ask review
Agents to cite concrete omissions, circular steps, source drift, and weak
teaching decisions. Do not reveal a desired verdict to an independent reviewer.

The reviewer for a cluster should be distinct from its writer whenever the
platform supports that separation. The main Agent resolves findings and decides
whether the cluster is accepted.

## 6. Apply document-specific acceptance gates

A concept document is acceptable only when the content itself supports all
applicable items below:

- explains the problem or purpose that makes the concept worth introducing;
- gives a plain-language mental model before or alongside formalism;
- states a precise definition with domains, conditions, and notation;
- works through at least one concrete example rather than merely naming one;
- exposes a nonexample, boundary case, or misconception when it clarifies why a
  condition matters;
- makes a deliberate visual/interactive decision: build a meaningful component
  when manipulation would reveal the idea, otherwise explain why prose or a
  static figure is clearer;
- remains faithful to the supplied source and retains strong source examples;
- connects prerequisites to a later problem the concept makes approachable.

A derivation document is acceptable only when it:

- uses every tail premise explicitly and explains what each contributes;
- states why each substantial step is attempted before carrying it out;
- interprets formulas after important transformations instead of leaving an
  unexplained equation chain;
- never assumes the head claim or one of its consequences as a premise;
- exposes assumptions, domains, quantifiers, and boundary conditions where they
  become relevant;
- carries a small example through the reasoning when it improves understanding;
- ends with a plain-language conclusion and the exact result now established.

These are semantic gates, not mandatory section headings or phrase-matching
checks. Depth follows the learning obstacle. A short page may pass when the idea
is genuinely simple; a long page fails if it merely repeats formulas.

## 7. Review, integrate, and scale gradually

For each batch:

1. Have a reviewer compare every draft against its source packet, graph
   semantics, acceptance gate, and the accepted exemplars.
2. Resolve substantive findings before publication. Do not defer missing
   motivation, reasoning, examples, or boundaries as cosmetic polish.
3. Let the main Agent write accepted drafts into `document.md` serially, render
   `index.html`, and run the workspace and math-page audits.
4. Inspect interactive pages at normal and narrow widths. Verify the component
   teaches its stated question, responds correctly, and does not create nested
   vertical scrolling.
5. Record which pages were accepted, remain provisional, or are blocked by
   missing sources.
6. Compare the completed batch directly with the exemplars before opening the
   next batch.

The first batch contains exactly one pilot teaching cluster. Declare the finite
set of clusters in each later batch before dispatching it, and do not dispatch a
new batch until every cluster in the current one is accepted or explicitly
blocked. This makes quality loss visible before it spreads across the graph.

Stop scaling when a batch misses the quality gate, shows repeated notation or
source errors, or becomes materially thinner than the exemplars. Reduce the
cluster size, improve the source packet or assignment, and re-review the failed
batch before continuing. More Agents do not repair a weak contract.

## Completion standard

Claim completion only when every in-scope page has passed its applicable
acceptance gate, source and graph review, publication sync, and technical audit.
Report provisional or blocked pages explicitly. A count of populated files,
generated modules, passing render commands, or successful Agent tasks is never
enough on its own.
