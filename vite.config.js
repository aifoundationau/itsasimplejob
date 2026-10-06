import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
  // Load environment variables from .env file
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      port: 3000,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          customer: resolve(__dirname, 'customer.html'),
          customerAdmin: resolve(__dirname, 'customer-admin.html'),
          franchise: resolve(__dirname, 'franchise.html'),
          provider: resolve(__dirname, 'provider.html'),
          serviceProvider: resolve(__dirname, 'service-provider.html')
        }
      }
    },
    plugins: [
      {
        name: 'html-env-injection',
        transformIndexHtml(html) {
          // Public client-side configuration injected safely into window.ENV
          // Note: Secret keys (such as STRIPE_SECRET_KEY) are NEVER exposed to the client.
          const clientEnv = {
            GOOGLE_MAPS_API_KEY: env.GOOGLE_MAPS_API_KEY || '',
            STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY || '',
            STRIPE_ACCOUNT_ID: env.STRIPE_ACCOUNT_ID || '',
            IMGBB_API_KEY: env.IMGBB_API_KEY || '',
            IMGBB_UPLOAD_URL: env.IMGBB_UPLOAD_URL || 'https://api.imgbb.com/1/upload',
            IMGBB_ALBUM_URL: env.IMGBB_ALBUM_URL || 'https://ibb.co/album/k4vjCb',
            FIREBASE_API_KEY: env.FIREBASE_API_KEY || '',
            FIREBASE_AUTH_DOMAIN: env.FIREBASE_AUTH_DOMAIN || 'ai-foundation-firebase.firebaseapp.com',
            FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID || 'ai-foundation-firebase',
            FIREBASE_STORAGE_BUCKET: env.FIREBASE_STORAGE_BUCKET || 'ai-foundation-firebase.firebasestorage.app',
            FIREBASE_MESSAGING_SENDER_ID: env.FIREBASE_MESSAGING_SENDER_ID || '',
            FIREBASE_APP_ID: env.FIREBASE_APP_ID || '',
            GEMINI_API_KEY: env.GEMINI_API_KEY || '',
            GEMINI_PROJECT_ID: env.GEMINI_PROJECT_ID || 'gen-lang-client-0551298781',
            GEMINI_MODEL: env.GEMINI_MODEL || 'gemini-3.8-flash',
            GEMINI_ENABLED: env.GEMINI_ENABLED === 'true'
          };

          const scriptTag = `\n  <script id="env-config">\n    window.ENV = Object.freeze(${JSON.stringify(clientEnv, null, 2)});\n  </script>`;
          return html.replace('</head>', `${scriptTag}\n</head>`);
        }
      }
    ]
  };
});
