import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    include: ['@atlaskit/pragmatic-drag-and-drop/element/adapter']
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/]
    }
  }
});
