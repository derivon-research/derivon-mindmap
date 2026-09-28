/**
 * PROTOTYPE ONLY — throwaway branch (#153), never merged to main.
 *
 * Three questions, two switches:
 * - `?variant=A|B|C` — where routes live in the UI, on both sides (创作 / 学习 in the top bar);
 * - `?store=1|2|3`   — where route files go and what they look like: the disk panel at the
 *   bottom shows every file the *saved* routes would be written to, re-rendered on every save.
 *
 * Everything is in memory on the real example graph. Nothing is written anywhere.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../app/app.css';
import '../modes/authoring/authoring.css';
import '../modes/learning/learning.css';
import './prototype.css';
import { initialRoutes } from './data';
import type { Route, StoreKey } from './routeModel';
import { DiskPanel, FakeTopBar, PrototypeSwitcher, readMode, readStore, readVariant, setParam, type Mode, type RouteSession, type VariantKey } from './shared';
import { VariantA } from './variantA';
import { VariantB } from './variantB';
import { VariantC } from './variantC';

function Prototype() {
  const [variant, setVariant] = useState<VariantKey>(readVariant);
  const [store, setStore] = useState<StoreKey>(readStore);
  const [mode, setMode] = useState<Mode>(readMode);
  const [routes, setRoutes] = useState<readonly Route[]>(initialRoutes);
  const session: RouteSession = {
    routes,
    save: (route) => setRoutes((current) => current.some((r) => r.id === route.id)
      ? current.map((r) => r.id === route.id ? route : r) : [...current, route]),
    remove: (routeId) => setRoutes((current) => current.filter((r) => r.id !== routeId)),
  };
  const View = { A: VariantA, B: VariantB, C: VariantC }[variant];
  return <div className="app p-app">
    <FakeTopBar mode={mode} onMode={(m) => { setMode(m); setParam('mode', m); }} />
    <div className="p-stage"><View key={variant + mode} mode={mode} session={session} /></div>
    <DiskPanel routes={routes} store={store} />
    <PrototypeSwitcher variant={variant} store={store}
      onVariant={(v) => { setVariant(v); setParam('variant', v); }}
      onStore={(s) => { setStore(s); setParam('store', s); }} />
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Prototype /></StrictMode>);
