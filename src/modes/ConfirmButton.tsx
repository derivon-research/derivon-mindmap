import { Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import './route-editor.css';

export type ConfirmButtonProps = {
  /** What the button shows before it is pressed. */
  readonly children: ReactNode;
  /** The question asked once it is pressed, saying what the action does and does not touch. */
  readonly prompt: ReactNode;
  /** The accessible name of the question and its two answers. */
  readonly groupLabel: string;
  /** The answer that runs the action. */
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  /** Whether to ask at all. False runs the action on the first press: there is nothing to lose. */
  readonly ask?: boolean;
  /** A destructive action is shown as one, before and after it is pressed. */
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  /** The button's accessible name, when its content is only an icon. */
  readonly label?: string;
  readonly title?: string;
};

/**
 * A button whose action asks first. The first press arms it: the question appears with the
 * confirming answer and «算了»; only the confirming answer runs the action.
 */
export function ConfirmButton({
  children, prompt, groupLabel, confirmLabel, onConfirm, ask = true, danger = false, disabled, className, label, title,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  if (!armed || !ask) {
    return <button type="button" className={className ?? (danger ? 'route-editor-danger' : undefined)} aria-label={label}
      title={title} disabled={disabled} onClick={() => (ask ? setArmed(true) : onConfirm())}>{children}</button>;
  }
  return <span className="route-editor-confirm" role="group" aria-label={groupLabel}>
    {prompt}
    <button type="button" className={danger ? 'route-editor-danger' : undefined}
      onClick={() => { setArmed(false); onConfirm(); }}>{confirmLabel}</button>
    <button type="button" onClick={() => setArmed(false)}>算了</button>
  </span>;
}

/**
 * Deleting a route asks twice, and the question says what deleting does not touch. Every place
 * that deletes a route file — the editor, an unreadable file, the shelf — uses this one control.
 */
export function DeleteRouteButton({ prompt, disabled, onDelete, iconOnly = false, className }: {
  readonly prompt: string; readonly disabled?: boolean; readonly onDelete: () => void;
  /** A compact trigger showing only the icon, named for assistive technology. */
  readonly iconOnly?: boolean;
  readonly className?: string;
}) {
  return <ConfirmButton danger disabled={disabled} prompt={prompt} groupLabel="确认删除路线" confirmLabel="删除"
    onConfirm={onDelete} className={className} {...iconOnly ? { label: '删除这条路线', title: prompt } : {}}>
    <Trash2 size={14} aria-hidden={iconOnly || undefined} />{!iconOnly && '删除路线'}
  </ConfirmButton>;
}
