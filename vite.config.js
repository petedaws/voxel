import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative asset paths so the build works on GitHub Pages project URLs
  // (e.g. https://<user>.github.io/<repo>/) instead of only domain root.
  base: './',
  worker: {
    format: 'es',
  },
});
