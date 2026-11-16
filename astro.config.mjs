// @ts-check
import { defineConfig } from 'astro/config';
import alpinejs from '@astrojs/alpinejs';

// https://astro.build/config
export default defineConfig({
  integrations: [
    alpinejs(),
  ],
  output: 'static',
  build: {
    format: 'file'
  },
  vite: {
    resolve: {
      alias: [
        { find: /^alpinejs$/, replacement: '@alpinejs/csp' }
      ]
    },
    build: {
      // Keep every bundled script in its own file. The Content Security Policy in Layout.astro
      // allows scripts from this site only, so none may be inlined into the page.
      assetsInlineLimit: 0
    },
    ssr: {
      noExternal: ['@astrojs/alpinejs']
    }
  }
});
