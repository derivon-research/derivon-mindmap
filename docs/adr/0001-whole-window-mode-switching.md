# Switch modes by replacing the whole window

The application offers a learning mode and an authoring mode, and it had to decide how a
user moves between them. It switches the whole window: one mode occupies the window at a
time, and a segmented control in the application top bar swaps which one. The control
belongs to the top bar rather than to either mode's panels, so neither mode owns the way
out of itself. Entering learning from authoring carries the concept selected in authoring
as the learning target and seeds known concepts from the workspace default, so the switch
does not restage orientation; returning to authoring restores selection, viewport and
uncommitted edits. The two modes are therefore mutually exclusive subtrees, which is also
where the lazy-loading boundary cuts most cleanly: graph rendering, formula typesetting and
rich-text editing load with the mode that needs them and stay out of the first screen.

Neither host opens on a mode-selection screen. The desktop host's first frame is a
full-window list of recent workspaces; opening one lands in authoring. The web host has no
workspace selection and no segmented control at all, because the authoring mode is absent
from a web build's module graph rather than hidden behind a runtime check — a control with
nothing to point at cannot be drawn.

## Considered options

Three variants were prototyped on both hosts (`prototype/two-modes`, not merged).

- **A, whole-window switching — chosen.**
- **B, docked preview:** a learning view docked beside authoring, following the selected
  concept. Rejected: both sides resident at once makes the first-screen budget
  unaccountable, and the dock cannot hold the orientation dialogue.
- **C, view tabs:** authoring in one tab, each learning target in another, splittable.
  Rejected: it adds a window concept above modes and quietly redefines a mode as a view,
  which would force the product vocabulary to be rewritten.

The web side of all three variants embedded the same settled orientation entry state,
confirming that "web opens directly inside learning" has no competing shape.
