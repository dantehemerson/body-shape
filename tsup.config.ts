import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', core: 'src/core.ts', styles: 'src/styles.css' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  external: ['react', 'react-dom', 'react/jsx-runtime', 'three', '@react-three/fiber', 'three-stdlib'],
});
