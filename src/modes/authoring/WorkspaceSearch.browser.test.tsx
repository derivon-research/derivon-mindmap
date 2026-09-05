import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import type { WorkspaceContent } from '../../workspace/index';
import { WorkspaceSearch } from './WorkspaceSearch';

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals(); });
const fixture: WorkspaceContent = {
  title: 'Search', graphText: '', requiresMigrationConsent: false, diagnostics: [], companionMetadata: {},
  graph: { points: [
    { id: 'c-1', data: { label: 'Vector space', document: 'docs/c-1', format: 'markdown' } },
    { id: 'c-2', data: { label: '积分', document: 'docs/c-2', format: 'html' } },
  ], hyperedges: [{ id: 'h-1', tails: ['c-1'], head: 'c-2', weight: 1, data: { document: 'docs/h-1', format: 'markdown' } }] },
  documents: {
    'docs/c-1/document.md': { status: 'ready', text: `${'Introduction. '.repeat(200)}needleAtDocumentEnd` },
    'docs/c-1/index.html': { status: 'ready', text: '<style>forbiddenGeneratedStyle</style>' },
    'docs/c-2/index.html': { status: 'ready', text: '<head><style>secretStylesheet</style></head><p>连续函数与微积分</p><script>secretJavascript</script>' },
    'docs/h-1/document.md': { status: 'ready', text: '# Derivation\n\n独特推导证明 integral construction' },
  },
};
async function mount(content = fixture) {
  container = document.createElement('div'); container.style.width = '500px'; document.body.append(container);
  root = createRoot(container);
  const onOpenObject = vi.fn();
  await act(async () => root!.render(<WorkspaceSearch content={content} onOpenObject={onOpenObject} />));
  await expect.poll(() => container!.querySelector('.ws-search')?.getAttribute('data-search-ready'), { timeout: 60_000 }).toBe('true');
  return onOpenObject;
}

it('keeps input-to-frame latency below 100ms with 1800 long source documents', async () => {
  const points = Array.from({ length: 1800 }, (_, index) => ({ id: `long-${index}`, data: {
    label: `Long ${index}`, document: `docs/long-${index}`, format: 'markdown' as const,
  } }));
  const body = 'Vector spaces and linear algebra. 向量空间与线性代数。 '.repeat(400);
  const content: WorkspaceContent = { ...fixture, graph: { points, hyperedges: [] }, documents: Object.fromEntries(points.flatMap((point, index) => [
    [`${point.data.document}/document.md`, { status: 'ready' as const, text: body + (index === 1799 ? 'TailSentinel' : '') }],
    [`${point.data.document}/index.html`, { status: 'ready' as const, text: `<p>${body}</p>` }],
  ])) };
  await mount(content);
  const samples: number[] = [];
  container!.querySelector('input')!.addEventListener('input', () => {
    const before = performance.now();
    requestAnimationFrame(() => samples.push(performance.now() - before));
  }, { capture: true });
  const input = page.getByRole('combobox');
  for (const query of ['v', 've', 'vec', 'vect', 'vecto', 'vector']) await input.fill(query);
  await expect.poll(() => samples.length).toBe(6);
  console.log('Search input-to-frame ms', samples);
  expect(Math.max(...samples)).toBeLessThanOrEqual(100);
  await expect.poll(() => container!.querySelectorAll('[role="option"]').length).toBe(12);
  await input.fill('TailSentinel');
  await expect.element(page.getByRole('option')).toHaveTextContent('Long 1799');
}, 60_000);

it('searches document endings, English typos and Chinese text using the worker index', async () => {
  await mount();
  const input = page.getByRole('combobox');
  await input.fill('needleAtDocumentEnd');
  await expect.element(page.getByRole('option')).toHaveTextContent('Vector space');
  await input.fill('vecto space');
  await expect.element(page.getByRole('option')).toHaveTextContent('Vector space');
  await input.fill('连续函数');
  await expect.element(page.getByRole('option')).toHaveTextContent('积分');
});

it('filters derivations and opens the current keyboard selection', async () => {
  const open = await mount();
  await page.getByRole('combobox').fill('独特推导');
  await expect.element(page.getByRole('option')).toHaveTextContent('h-1');
  await page.getByRole('button', { name: '概念', exact: true }).click();
  await expect.element(page.getByText('没有匹配对象')).toBeVisible();
  await page.getByRole('button', { name: '推导', exact: true }).click();
  await expect.element(page.getByRole('option')).toHaveTextContent('h-1');
  await page.getByRole('combobox').click();
  await page.getByRole('combobox').fill('integral');
  await expect.element(page.getByRole('option')).toHaveTextContent('h-1');
  await page.getByRole('combobox').element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ kind: 'derivation', id: 'h-1' }));
});

it('does not index generated duplicate HTML, scripts or styles and clears stale results', async () => {
  await mount();
  const input = page.getByRole('combobox');
  await input.fill('Vector');
  await expect.element(page.getByRole('option')).toBeVisible();
  await input.fill('secretJavascript');
  await expect.element(page.getByText('没有匹配对象')).toBeVisible();
  await input.fill('forbiddenGeneratedStyle');
  await expect.element(page.getByText('没有匹配对象')).toBeVisible();
  await input.fill('Vector');
  await page.getByRole('button', { name: '清空搜索' }).click();
  await expect.element(input).toHaveValue('');
  await expect.element(page.getByRole('listbox')).not.toBeInTheDocument();
});
