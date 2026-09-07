/**
 * The three-state side panels of the route-learning screen: expanded, default, hidden.
 *
 * The rule that makes it work is here rather than in the component, because it is the
 * whole point of three states: the textbook in the middle never gives up width. Widening
 * one side hides the other; letting that side back down returns the one it hid. A panel
 * the learner closed themselves is not returned by anything but asking for it.
 */
export type PanelState = 'expanded' | 'default' | 'hidden';
export type PanelSide = 'tutor' | 'rail';
export type PanelLayout = { readonly tutor: PanelState; readonly rail: PanelState };

export const DEFAULT_PANELS: PanelLayout = { tutor: 'default', rail: 'default' };

export function setPanel(layout: PanelLayout, side: PanelSide, state: PanelState): PanelLayout {
  const other: PanelSide = side === 'tutor' ? 'rail' : 'tutor';
  if (state === 'expanded') return { ...layout, [side]: state, [other]: 'hidden' } as PanelLayout;
  // Only the side that did the hiding gives the other side back.
  const restored = layout[side] === 'expanded' && layout[other] === 'hidden' && state !== 'hidden'
    ? 'default' : layout[other];
  return { ...layout, [side]: state, [other]: restored } as PanelLayout;
}

/**
 * Whether an answer needs the panel widened for it: a formula on a line of its own, or an
 * embedded interactive component. A narrow column breaks both — the formula wraps
 * mid-expression, the component is clipped — so the panel opens itself instead of waiting
 * to be dragged. The rule lives with the layout so it reads the same for the deterministic
 * guidance and for a connected provider: the layout must not fork on whether one exists.
 */
export function answerNeedsWidth(answer: string): boolean {
  const lines = answer.split('\n');
  const displayMath = answer.includes('$$')
    || lines.some((line) => /^\s*\\\[/.test(line) || /^\s*\$[^$\n]+\$\s*$/.test(line));
  const component = /<(iframe|canvas|svg|derivon-[a-z-]+)\b/i.test(answer)
    || /^\s*```(interactive|widget)/m.test(answer);
  return displayMath || component;
}
