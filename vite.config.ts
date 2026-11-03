import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ clearScreen: false, server: { strictPort: true, port: 1420 }, envPrefix: ['VITE_', 'TAURI_ENV_*'], build: { rollupOptions: { input: { main: resolve(__dirname,'index.html'), focus: resolve(__dirname,'focus.html') } } } });
