// PROTOTYPE build config — throwaway. Builds only prototypes/entry-orientation into dist-prototype/.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'prototypes/entry-orientation',
  base: './',
  plugins: [react()],
  build: { outDir: '../../dist-prototype', emptyOutDir: true },
});
