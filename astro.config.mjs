// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import alpinejs from '@astrojs/alpinejs';

// https://astro.build/config
export default defineConfig({
  integrations: [
    tailwind(), 
    alpinejs(),
  ],
  output: 'static',
  build: {
    format: 'file'
  },
  vite: {
    ssr: {
      noExternal: ['@astrojs/alpinejs']
    },
    build: {
      rollupOptions: {
        external: ['@atlaskit/pragmatic-drag-and-drop/adapter']
      }
    }
  }
});