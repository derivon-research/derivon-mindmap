import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// `#host` resolves at build time: web builds get `src/hosts/web/host.ts`, desktop builds
// get `src/hosts/desktop/host.ts`. See `vite.config.ts`.
import { host } from '#host';
import App from './App';
import { clearStoredFrontendCrashReport } from '../hosts/browserDiagnostics';
import './app.css';

clearStoredFrontendCrashReport();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App host={host} />
  </StrictMode>,
);
