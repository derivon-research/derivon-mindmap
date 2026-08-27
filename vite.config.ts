import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import type { Plugin } from 'vite';

const selectionDebugPath = '/tmp/derivon-selection-debug.ndjson';

function selectionDebugPlugin(): Plugin {
  return {
    name: 'derivon-selection-debug',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__derivon_selection_debug', (request, response) => {
        if (request.method === 'DELETE') {
          void writeFile(selectionDebugPath, '').then(() => {
            response.statusCode = 204;
            response.end();
          }).catch((error: unknown) => {
            response.statusCode = 500;
            response.end(error instanceof Error ? error.message : String(error));
          });
          return;
        }
        if (request.method === 'GET') {
          void readFile(selectionDebugPath, 'utf8').then((content) => {
            response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
            response.end(content);
          }).catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') {
              response.statusCode = 204;
              response.end();
              return;
            }
            response.statusCode = 500;
            response.end(error.message);
          });
          return;
        }
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.end();
          return;
        }

        let body = '';
        request.setEncoding('utf8');
        request.on('data', (chunk: string) => {
          if (body.length < 64_000) body += chunk;
        });
        request.on('end', () => {
          const line = body.replace(/[\r\n]+/g, '');
          void appendFile(selectionDebugPath, `${line}\n`).then(() => {
            response.statusCode = 204;
            response.end();
          }).catch((error: unknown) => {
            response.statusCode = 500;
            response.end(error instanceof Error ? error.message : String(error));
          });
        });
      });
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [react(), selectionDebugPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
