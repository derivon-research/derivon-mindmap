import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CrashBoundary } from './CrashBoundary';
import { installGlobalCrashCapture } from './crashReport';

installGlobalCrashCapture();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashBoundary><App /></CrashBoundary>
  </StrictMode>,
);
