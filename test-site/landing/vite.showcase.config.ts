import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { createCapabilityProjection } from './assistant/capability-projection';

export default defineConfig({
  plugins: [{
    name: 'showcase-capability-projection',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'capability-projection.json', source: JSON.stringify(createCapabilityProjection()) });
    },
  }],
  resolve: { alias: { '@yardimci-asistan/shared': fileURLToPath(new URL('../../packages/shared/index.ts', import.meta.url)) } },
  build: {
    lib: { entry: 'assistant/showcase-entry.ts', name: 'YardimciShowcase', formats: ['iife'], fileName: () => 'showcase.js' },
    outDir: 'assets/assistant', emptyOutDir: false
  }
});
