import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // app version (from package.json when started through npm) — attached to crash reports
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.VITE_APP_VERSION ?? process.env.npm_package_version ?? 'dev') },
  server: {
    // Forward API calls to the Express server so cookies stay same-origin
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // React in its own long-cacheable file; Ant Design is split per page automatically
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
