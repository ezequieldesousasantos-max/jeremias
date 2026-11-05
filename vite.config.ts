import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Em desenvolvimento o Vite roda como middleware dentro do server.ts (mesma porta),
// então não há proxy: o front e a API compartilham a origem.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
