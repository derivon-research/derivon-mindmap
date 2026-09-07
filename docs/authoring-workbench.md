# Authoring workbench

The #51 follow-up uses the approved prototype C workspace frame: independently collapsible
relations on the left, an object/graph centre, and a persistent simulated Agent on the right.
The prototype harness and its in-memory workspace implementation are not shipped.

## Navigation

Opening a workspace enters the authoring overview, including for an empty workspace. Creating
an object is an explicit workbench command; successful creation opens the new object's
document editor. See [new object](#new-object).

- Selecting a concept in the overview enters its one-step neighbourhood.
- Selecting a different concept in the neighbourhood selects it and changes the neighbourhood
  focus, as specified in CONTEXT.md.
- Selecting a derivation selects that derivation without changing the neighbourhood focus.
  Its own joint premises and result appear in the relations pane.
- Clicking an already-selected neighbourhood object opens its document editor. An activation
  event also opens that object. Selection and neighbourhood focus are distinct authoring state.
- Search results and relation links open the corresponding object document directly.
- An object page without a selection offers graph browsing when concepts exist. Only a genuinely
  empty writable workspace offers creation of its first concept.

### New object

The workbar carries one creation command, 新建, which opens a dialogue on a kind choice:
concept or derivation. A concept is a name and a return key. A derivation is the ADR-0002
form — search and multi-select the joint premises (empty is legal), single-select the head
(a missing head is the only blocked submit), set the learning cost — with a live endpoint
preview as its title. Closing the dialogue discards the draft and releases its protection;
creating lands on the new object's document editor.

The relations pane grows the contextual shortcut: quiet plus buttons in the 前提推导 and
后续推导 groups open the dialogue directly on the derivation form with the current concept
already selected as the conclusion, respectively as a premise. Prefill is selection help,
never an automatic creation.

### Editing a derivation's structure

Selecting a derivation turns the relations pane — which already showed that derivation's
joint premises and result — into its structure editor. Premises are removed one by one and
added through a concept search; the result is replaced through the same search, never
cleared, so the draft has no headless state to publish; the learning cost is a field beside
them. Empty premises, cycles, self-loops and parallel derivations are all legal content and
are not warned about: `derivon-core` treats an ungrounded cycle as an unreachable target,
not as a structure error.

Premises, result and cost are one decision and leave as one content change on an explicit
保存更改. Until then they stay a draft that protects its editing basis; 放弃更改 and selecting
another object both discard it. Nothing else edits a derivation's structure: a concept's page
lists its neighbouring derivations for opening only, so one derivation never has two editing
entries. Without authoring authority the pane stays the read-only endpoint list.

Changing endpoints needs no reference analysis. The owned document directory does not move,
so cross-document links and images are untouched, and orientation configuration names
concepts rather than derivations. A premise removal that makes some target unreachable is
not an error and is not reported as one here; reachability belongs to route solving.

### The orientation view

A third centre view, 开局, sits beside 对象 and 图浏览. It is not a mode: orientation is a stage
of the learning side, and editing its configuration is an authoring action. It is not an object
either — there is one configuration per workspace and it is always there — so it is not reachable
through search or the create command. Selecting this view changes the centre and the content of
the left pane, which shows the orientation outline in the same role it plays for relations: the
context navigation for what the centre is showing. The pane keeps its independent collapse, and
the Agent pane is untouched.

Orientation edits live in a draft until explicitly accepted, and a configuration carrying an
error cannot be accepted at all. Creating the configuration is a centre-view action, so the
outline never owns it. See [orientation](orientation.md).

### Object metadata

An object's own properties sit above its document, one per line and in the same quiet
register as the document itself: a name that reads as the title and edits in place, a
one-line description, and — for a concept — its tags. Ticking a tag is complete on its own
and goes straight into content; a new tag can be declared and attached in one action.
Everywhere else — the concept picker's filter, an orientation action's targets — tags are
ticked, not defined.

The id and the document directory are not shown. They are identity and storage, not
authored metadata; the directory appears only in the error that reports an unreadable
document. Renaming an object is never a change of identity: the id is generated once, at
creation, and no surface asks for or accepts one. See [new object](#new-object) for how
concepts and derivations are created, and [editing a derivation's
structure](#editing-a-derivations-structure) for its endpoints and cost, which live in the
relations pane rather than here.

### Deleting an object

Deletion is a dialogue, in the same frame as 新建 and for the same reason: it is one thing,
decided from start to end, with nothing else being edited meanwhile. A quiet control in the
object's title row opens it. No graph view deletes anything (ADR-0002).

Opening it assembles the plan before offering anything: the derivations that cannot survive
losing an endpoint, every file the host reports under each removed directory, the
cross-document links and shared images that would be broken, and the places the orientation
configuration names the concept. The file list comes from the host inventory rather than
from the document text, so an asset the body no longer mentions is in it; nothing outside
those directories ever is. The plan states what it found and does not explain itself: a file
list is a file list, and the rules behind it are documented here, not repeated on screen.

Each incoming reference gets the same three named repairs the reference report offers —
改指到, 取消链接, 删除引用 — but here they are written into the plan rather than applied on
the spot, and the orientation configuration is taken out only when that is chosen too.
Deletion stays disabled until every one of them is decided, and the whole plan — graph,
owned files and repairs — is then one content change on one commit (ADR-0005). Executing is
itself two steps, the second naming what it deletes. Closing the dialogue discards the plan;
nothing is written by looking at it.

A reference source that could not be read or could not be analysed refuses the deletion
outright: unreadable is not evidence of no references, so the object stays where it is with
its entry still on it. Such a source is repaired where it lives, not here, so the plan lists
it with the way to its document, and taking that way closes the dialogue. Taking a concept out of the orientation configuration removes
an action that named nothing else along with it — a configuration carrying an action that
resolves to no concept could not be accepted at all — while its option and question stay, to be
dealt with in the orientation view. A failed deletion re-reads the plan and reports the failure
instead of claiming success. An unapplied document draft also blocks it, because the repairs
are written against the bodies that are in effective content.

Assembling the plan reads every owned body and asks the host for each directory, so it is a
deliberate action with a progress status rather than an edit-latency path; the ≤ 200 ms budget
covers the editing interactions, not this acquisition. Both are measured — see
[runtime performance](testing/runtime-performance.md#authoring-edits).

### Damaged documents and references

An object whose document cannot be read still appears in the graph and in relations; its
page reports the failure with the document path and offers one repair, and the repair only
happens because it was chosen and then confirmed. Creating the empty document refuses a
collision rather than overwriting; replacing an unreadable file is a second, separately
confirmed decision that says what is lost.

Below the editor, the object page reports what its document points at: how many references
it carries, which ones resolve to nothing, which ones effective content cannot decide about,
and which reference sources could not be analysed at all. 引用影响 additionally reports what
points at this object — cross-document links, images shared from its directory, and the
orientation configuration. Repairs are offered per reference and named: 改指到, 取消链接,
删除引用. Each is confirmed before it is applied, each is a complete content change on the
shared save path, and none of them is applied while an unapplied draft would be overwritten.

Document drafts, the orientation draft and the Agent conversation survive centre-view and mode changes. Merely selecting
an object in the graph does not mount its document editor or parse its body. The last opened
document stays mounted while the graph is visible, until another document is explicitly opened.
The simulated Agent is labelled and never invokes a model or executes its plans.

## Neighbourhood presentation

The current rendering module reproduces v0.4 presentation without restoring its application
architecture: 136 by 64 knowledge cards with 2px corners and an ID line, 54px derivation diamonds,
semantic red/blue ports and the original forward/reverse cubic control distances. Concept head
ports are red on the left; concept tail ports are blue on the right. Derivation premise ports
are blue on the left and conclusion ports red on the right. Selection retains the purple outline.
The neighbourhood uses left-to-right G6 Dagre layout. Its initial/topology fit includes either-axis
overflow without enlarging small cards; its edges remain visible during viewport transforms.
Overview and route presentation are not changed by this restoration.

Ports and edges are visual only, with pointer events disabled. The renderer still accepts a
semantic `GraphView` and emits selection/activation through `onEvent`. Native geometry, layout,
ports and curves remain private to `src/rendering/`; no legacy graph surface, gestures, coordinates,
or application-owned simulation is reintroduced. This follows ADR-0002, ADR-0003 and ADR-0006.

Document acceptance, image staging and mode-independent persistence follow
[workspace-content-sync.md](workspace-content-sync.md). This work does not complete graph editing,
external synchronization or arbitrary document-body reference integrity.
