import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DocumentEditor } from './DocumentEditor';

function imageUrl(color: string) {
  const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
  const context = canvas.getContext('2d')!;
  context.fillStyle = color; context.fillRect(0, 0, 2, 2);
  return canvas.toDataURL('image/png');
}

it('refreshes existing and new image nodes with the current resolver without recreating the editor', async () => {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const firstUrl = imageUrl('red');
  const nextUrl = imageUrl('blue');
  const firstSource = URL.createObjectURL(await (await fetch(firstUrl)).blob());
  const nextSource = URL.createObjectURL(await (await fetch(nextUrl)).blob());
  const first = vi.fn(async (_source: string) => ({ url: firstUrl }));
  const next = vi.fn(async (_source: string) => ({ url: nextUrl }));
  const onChange = vi.fn();
  const props = { label: 'Document', currentId: 'a', documentPath: 'docs/a/document.md', referenceTargets: [],
    onOpenReference: vi.fn(), storeImage: vi.fn(async () => ({ source: 'assets/test.png', alt: 'Test' })), onImageError: vi.fn(), onChange };
  try {
    const value = `![A](${firstSource})\n\nDraft`;
    await act(async () => root.render(<DocumentEditor {...props} value={value} resolveImage={first} />));
    await expect.poll(() => container.querySelector('figure')?.dataset.state).toBe('ready');
    const editor = container.querySelector('[contenteditable="true"]');
    expect(container.querySelector('figure img')?.getAttribute('src')).toBe(firstUrl);
    first.mockRejectedValue(new Error('obsolete reader'));
    await act(async () => root.render(<DocumentEditor {...props} value={value} resolveImage={next} />));
    await expect.poll(() => container.querySelector('figure img')?.getAttribute('src')).toBe(nextUrl);
    await expect.poll(() => container.querySelector('figure')?.dataset.state).toBe('ready');
    expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => root.render(<DocumentEditor {...props} value={`![B](${nextSource})\n\nDraft`} resolveImage={next} />));
    await expect.poll(() => next.mock.calls.some(([source]) => source === nextSource)).toBe(true);
    await expect.poll(() => container.querySelector('figure')?.dataset.state).toBe('ready');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    URL.revokeObjectURL(firstSource);
    URL.revokeObjectURL(nextSource);
  }
});
