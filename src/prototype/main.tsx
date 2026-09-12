/**
 * PROTOTYPE ONLY — throwaway branch, never merged to main as-is.
 *
 * Question: three designs for "a learner has several confirmed routes — which one are they
 * on, and how do they get to another". Switchable via `?variant=A|B|C` on this throwaway
 * `/prototype.html` page, which mounts the real example workspace graph (64 concepts) with
 * routes really solved against it by the greedy test solver.
 *
 * State is in memory only; deleting a route is a local stub, never a write.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../app/app.css';
import '../modes/learning/learning.css';
import './prototype.css';
import { PrototypeSwitcher, readVariant } from './PrototypeSwitcher';
import { routes as initialRoutes } from './routes-data';
import { VariantA, VariantB, VariantC } from './variants';

function Prototype() {
  const variant = readVariant();
  const [routes, setRoutes] = useState(initialRoutes);
  const [openId, setOpenId] = useState<string | null>(null);
  const [walkingId, setWalkingId] = useState<string | null>(null);
  const onDelete = (routeId: string) => setRoutes((current) => current.filter((route) => route.id !== routeId));

  if (variant === 'B') return <div className="app">
    <VariantB routes={routes} onDelete={onDelete} />
    <PrototypeSwitcher current={variant} />
  </div>;

  if (variant === 'C') return <div className="app">
    {walkingId && <Walking routeId={walkingId} routes={routes} onDone={() => setWalkingId(null)} onDelete={onDelete} />}
    {!walkingId && <VariantC routes={routes} onDelete={onDelete} onWalk={setWalkingId} />}
    <PrototypeSwitcher current={variant} />
  </div>;

  return <div className="app">
    <VariantA routes={routes} onDelete={onDelete} openId={openId} onOpen={setOpenId} />
    <PrototypeSwitcher current={variant} />
  </div>;
}

/** Variant C hands off to the same walker A and B use, so the handoff is visible. */
function Walking({ routeId, routes, onDone, onDelete }: {
  readonly routeId: string;
  readonly routes: typeof initialRoutes;
  readonly onDone: () => void;
  readonly onDelete: (id: string) => void;
}) {
  void onDelete;
  return <VariantA routes={routes} onDelete={onDelete} openId={routeId} onOpen={onDone} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Prototype /></StrictMode>,
);
