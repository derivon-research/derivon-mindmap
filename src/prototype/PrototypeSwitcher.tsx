/** PROTOTYPE ONLY — throwaway. The floating variant switcher. */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';

export type VariantKey = 'A' | 'B' | 'C';

export const VARIANT_NAMES: Record<VariantKey, string> = {
  A: '路线书架 · 新视图 + 全宽列表',
  B: '侧栏切换器 · 走路时弹出',
  C: '开局选择 · 继续优先的主从页',
};

/** Reads `?variant=`, defaulting to A. No router in this project; the URL is enough. */
export function readVariant(): VariantKey {
  const value = new URLSearchParams(window.location.search).get('variant')?.toUpperCase();
  return value === 'A' || value === 'B' || value === 'C' ? value : 'A';
}

export function PrototypeSwitcher({ current }: { readonly current: VariantKey }) {
  const keys = Object.keys(VARIANT_NAMES) as VariantKey[];
  const go = (delta: number) => {
    const next = keys[(keys.indexOf(current) + delta + keys.length) % keys.length];
    // Built from the path and query directly: a prototype has no router, and `URL` on the
    // whole href is not worth the throw.
    const params = new URLSearchParams(window.location.search);
    params.set('variant', next);
    window.location.replace(`${window.location.pathname}?${params.toString()}`);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]')) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return <div className="proto-switcher" role="group" aria-label="原型变体">
    <button type="button" aria-label="上一个变体" onClick={() => go(-1)}><ChevronLeft size={17} /></button>
    <span className="proto-switcher-label">
      <strong>{current}</strong>
      <em>{VARIANT_NAMES[current]}</em>
      <small>← → 切换 · ?variant={current}</small>
    </span>
    <button type="button" aria-label="下一个变体" onClick={() => go(1)}><ChevronRight size={17} /></button>
  </div>;
}
