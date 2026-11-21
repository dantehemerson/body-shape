import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Served as a project page at https://dantehemerson.github.io/body-shape/
  base: '/body-shape/',
  build: { outDir: 'demo-dist' },
});
