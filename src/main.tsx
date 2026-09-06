import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CrashBoundary } from './CrashBoundary';
import { clearPendingCrashReports, installGlobalCrashCapture } from './crashReport';

installGlobalCrashCapture();
// Crash reports are diagnostic artifacts, not application state or a recovery mechanism.
void clearPendingCrashReports();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashBoundary><App /></CrashBoundary>
  </StrictMode>,
);
