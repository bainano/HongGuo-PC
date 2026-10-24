import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './'：构建产物用相对路径，Electron loadFile(file://) 可直接加载
// 使用 .mts 后缀强制以 ESM 方式加载本配置，避免 Vite CJS Node API 废弃警告
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist'
  }
});
