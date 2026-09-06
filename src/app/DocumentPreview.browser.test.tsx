import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { DocumentPreview, MarkdownPreview } from './DocumentPreview';

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container.remove(); });

it('renders Markdown and embedded HTML only in the preview without a persisted page', async () => {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  const markdown = '# Heading\n\n**Bold**\n\n<details><summary>Proof</summary>Inline HTML</details>\n';
  await act(async () => root!.render(<MarkdownPreview markdown={markdown} title="Source" documentPath="docs/a/document.md" />));
  const frame = container.querySelector('iframe')!;
  await expect.poll(() => frame.srcdoc).toContain('<h1>Heading</h1>');
  expect(frame.srcdoc).toContain('<strong>Bold</strong>');
  expect(frame.srcdoc).toContain('data:font/woff2;base64,');
  expect(frame.srcdoc).not.toContain('cdn.jsdelivr.net');
  expect(frame.srcdoc).toContain('<summary>Proof</summary>Inline HTML');
  expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
});

it('clears old image bytes when the content reader changes without changing HTML', async () => {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  const html = '<img src="assets/image.png">';
  await act(async () => root!.render(<DocumentPreview html={html} title="Document" documentPath="docs/a/index.html"
    readAsset={async () => new Uint8Array([1])} />));
  const frame = container.querySelector('iframe')!;
  await expect.poll(() => frame.srcdoc).toContain('base64,AQ==');
  let release!: (value: Uint8Array) => void;
  const pending = new Promise<Uint8Array>((resolve) => { release = resolve; });
  await act(async () => root!.render(<DocumentPreview html={html} title="Document" documentPath="docs/a/index.html"
    readAsset={() => pending} />));
  expect(frame.srcdoc).toBe('');
  await act(async () => release(new Uint8Array([2])));
  await expect.poll(() => frame.srcdoc).toContain('base64,Ag==');
});

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
