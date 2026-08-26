# Large-scale mathematics authoring

Use this workflow when revising or completing many concept and derivation
documents. Its purpose is to preserve textbook-level teaching quality when the
work is too large for one undifferentiated writing pass.

The protocol names roles and artifacts, not vendor APIs. A platform may call the
capability SubAgents, child agents, delegated tasks, parallel agents, workers, or
something else. Use only capabilities the current environment actually exposes.
This is a bounded delivery protocol, not a mandate to keep finding improvements.
Freeze scope and acceptance criteria once, execute them, then stop.

## Non-negotiable ownership rules

- `document.md` remains the source of truth for every Markdown object. Publish
  `index.html` from it using the workspace renderer after the prose is accepted.
- The main Agent owns the inventory, work plan, integration, graph-wide
  validation, and the final completion claim.
- Delegated Agents may write assigned documents directly when the platform
  provides isolated worktrees or guarantees exclusive ownership of disjoint
  paths. Otherwise they return drafts and review reports. Never let multiple
  Agents edit the same file, and do not make the main Agent retype a usable patch.
- Scripts may inventory, extract source material, render, compare, and audit.
  They must not contain chapter prose, lesson-sized text maps, or templates that
  bulk-author the documents. If such a generator already exists, do not run,
  extend, or treat its output as accepted teaching material.
- A page that exists, renders, or passes structural checks is not thereby a
  finished lesson. Coverage and quality are separate facts.
- An accepted page is closed. Do not reopen it because another analogy, stylistic
  refinement, or visualization might also be good. Reopen only for concrete new
  evidence of a blocking defect or a changed user requirement.

## 1. Establish the baseline

Inventory every in-scope concept and hyperedge together with its source and
publication files. Classify each page as one of:

- **Accepted exemplar:** explicitly approved by the user, or demonstrably at the
  user-approved level after close comparison. Length alone never qualifies it.
- **Provisional draft:** present but not yet shown to meet that bar. Treat prior
  bulk-generated pages as provisional even if they are syntactically complete.
- **Missing:** absent, empty, placeholder-only, or unusable.

Make this graph-wide inventory once. Freeze the in-scope page list and acceptance
rubric before the pilot begins. Do not repeatedly rediscover the workspace or
expand scope unless files, sources, or the user's request actually change.

Also inspect `.derivon/` and nearby tooling for scripts or data modules that
duplicate lesson prose. Record them as provenance risks. Preserve them unless
the user asks for removal, but never continue that authoring pattern.

Choose a few accepted exemplars that represent the needed document types, such
as one concept with a strong interactive visualization and one fully narrated
derivation. Extract their useful qualities rather than copying their headings or
surface style. If there is no accepted exemplar, complete and review a small
pilot cluster before scaling.

Maintain one compact progress ledger owned by the main Agent, using persistent
task state when the platform provides it or a task-local work log otherwise. One
row per page is enough: record its cluster, current classification, blocking
finding if any, publication state, and audit result. This ledger is coordination
metadata, never a substitute for lesson content or a second source of truth.

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

Keep the packet proportional to the cluster and reuse shared chapter material.
It is context for writing, not a separate research deliverable that must become
exhaustive before drafting can start. Once the exact governing sections and
examples are available, write the lesson.

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
share files or unsettled notation. A well-bounded writer may read its supplied
source and draft in one assignment; do not create extra Agent stages merely to
make the workflow look thorough. The main Agent remains responsible for
reconciling cross-cluster terminology and integrating isolated results.

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

Freeze these gates before drafting. A reviewer may apply them but may not invent
a stricter textbook, a new style preference, or additional scope after seeing the
draft.

## 7. Review, integrate, and scale gradually

Classify review findings before changing anything:

- **Blocking:** mathematical error, circular reasoning, material source conflict,
  missing prerequisite, omission of an applicable acceptance-gate element, or a
  broken publication or interaction.
- **Non-blocking:** another possible analogy, extra example, alternative proof,
  stylistic preference, optional animation, or polish beyond the frozen bar.

Only blocking findings trigger a repair. Record non-blocking ideas only when they
are useful to the user; never let them delay acceptance.

For each batch:

1. Give each cluster one review pass against its source packet, graph semantics,
   frozen acceptance gate, and accepted exemplars.
2. Give the writer at most one repair pass for the blocking findings. The
   reviewer may then verify only those findings; it must not start a fresh review.
   If a blocker remains, mark the page blocked with the exact reason and continue
   unaffected work instead of entering another loop.
3. Integrate accepted `document.md` changes, render `index.html`, and run audits
   scoped to the changed pages. Run graph-wide validation once at the end unless
   an actual structural error requires it earlier.
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
blocked. After the pilot, use the available parallel capacity for disjoint
clusters instead of serializing work that has no shared dependencies.

Stop scaling when a batch misses the quality gate, shows repeated notation or
source errors, or becomes materially thinner than the exemplars. Correct the
shared assignment once before the next batch; do not restart the inventory,
rewrite already accepted pages, or repeatedly redesign the process.

## Completion standard

Finish when every frozen in-scope page is either accepted or explicitly blocked,
accepted pages are published and audited, and final workspace validation passes.
Report blocked pages and their concrete reasons. Non-blocking improvements do not
prevent completion, and after this checklist passes the Agent must stop looking
for more work. A count of populated files, generated modules, passing render
commands, or successful Agent tasks is never enough on its own.
