// Compila o servidor (server.ts + src/) para dist-server/server.mjs.
// Os pacotes (express, @google/genai, dotenv) ficam externos e vão junto no app.
import { build } from 'esbuild';

await build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  outfile: 'dist-server/server.mjs',
  logLevel: 'info',
});
