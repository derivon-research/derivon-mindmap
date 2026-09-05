# Authoring workbench

The #51 follow-up uses the approved prototype C workspace frame: independently collapsible
relations on the left, an object/graph centre, and a persistent simulated Agent on the right.
The prototype harness and its in-memory workspace implementation are not shipped.

## Navigation

Opening a workspace enters the authoring overview, including for an empty workspace. Creating
a concept is an explicit command that opens its metadata form; successful creation opens the
new object's document editor.

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

Document drafts and the Agent conversation survive centre-view and mode changes. Merely selecting
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
