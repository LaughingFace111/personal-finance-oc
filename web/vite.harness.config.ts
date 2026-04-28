import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-harness',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        categoryPickerHarness: 'category-picker-harness.html',
        tagPickerHarness: 'tag-picker-harness.html',
      },
    },
  },
});
