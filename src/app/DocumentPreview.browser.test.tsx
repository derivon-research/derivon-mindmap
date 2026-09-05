import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { DocumentPreview } from './DocumentPreview';

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container.remove(); });

it('clears the old version immediately and ignores obsolete image preparation', async () => {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<DocumentPreview html="<p>Old version</p>" title="Document" documentPath="docs/a/index.html" />));
  const frame = container.querySelector('iframe')!;
  await expect.poll(() => frame.srcdoc).toContain('Old version');
  let release: (value: { url: string }) => void = () => {};
  const pending = new Promise<{ url: string }>((resolve) => { release = resolve; });
  await act(async () => root!.render(<DocumentPreview html={'<p>New version</p><img src="assets/slow.png">'} title="Document" documentPath="docs/a/index.html" resolveImage={() => pending} />));
  expect(frame.srcdoc).toBe('');
  expect(frame.getAttribute('aria-busy')).toBe('true');
  await act(async () => root!.render(<DocumentPreview html="<p>Another object</p>" title="Another" documentPath="docs/b/index.html" />));
  await expect.poll(() => frame.srcdoc).toContain('Another object');
  await act(async () => release({ url: 'https://example.invalid/unused.png' }));
  expect(frame.srcdoc).toContain('Another object');
  expect(frame.srcdoc).not.toContain('New version');
  expect(frame.getAttribute('aria-busy')).toBe('false');
});
