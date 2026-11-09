import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Server-only variables the /api handlers need locally (Vercel injects these in production)
const SERVER_ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'FIREBASE_SERVICE_ACCOUNT',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_DATABASE_ID',
  'SUPERADMIN_EMAILS',
  'FX_FALLBACK_AUD_USD',
  'FX_FALLBACK_USD_AUD',
  'DEV_COUNTRY'
];

// Serve /api/<name> from api/<name>.js so `npm run dev` and `npm run preview` behave like Vercel
function mountApiFunctions(middlewares, loadModule) {
  middlewares.use('/api', async (req, res, next) => {
    const name = (req.url || '').split('?')[0].replace(/^\/+|\/+$/g, '');
    const file = resolve(__dirname, 'api', `${name}.js`);
    if (!/^[a-z0-9-]+$/.test(name) || !existsSync(file)) return next();

    try {
      const mod = await loadModule(file);
      await mod.default(req, res);
    } catch (err) {
      console.error(`[api/${name}]`, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Local API function failed.' }));
      }
    }
  });
}

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
          serviceProvider: resolve(__dirname, 'service-provider.html'),
          terms: resolve(__dirname, 'terms.html')
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
            IMGBB_ALBUM_URL: env.IMGBB_ALBUM_URL || 'https://ibb.co/album/TKRnX5',
            IMGBB_ALBUM_ID: env.IMGBB_ALBUM_ID || 'TKRnX5',
            FIREBASE_API_KEY: env.FIREBASE_API_KEY || '',
            FIREBASE_AUTH_DOMAIN: env.FIREBASE_AUTH_DOMAIN || 'ai-foundation-firebase.firebaseapp.com',
            FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID || 'ai-foundation-firebase',
            FIREBASE_DATABASE_ID: env.FIREBASE_DATABASE_ID || 'itsasimplejob',
            FIREBASE_STORAGE_BUCKET: env.FIREBASE_STORAGE_BUCKET || 'ai-foundation-firebase.firebasestorage.app',
            FIREBASE_MESSAGING_SENDER_ID: env.FIREBASE_MESSAGING_SENDER_ID || '614773274800',
            FIREBASE_APP_ID: env.FIREBASE_APP_ID || '1:614773274800:web:a35e56edaa97ca729ea375',
            FIREBASE_MEASUREMENT_ID: env.FIREBASE_MEASUREMENT_ID || 'G-CKTVQJTZ8V',
            GEMINI_API_KEY: env.GEMINI_API_KEY || '',
            GEMINI_PROJECT_ID: env.GEMINI_PROJECT_ID || 'gen-lang-client-0551298781',
            GEMINI_MODEL: env.GEMINI_MODEL || 'gemini-3.8-flash',
            GEMINI_ENABLED: env.GEMINI_ENABLED === 'true',
            SUPERADMIN_EMAILS: env.SUPERADMIN_EMAILS || 'support@aifoundation.net.au'
          };

          const scriptTag = `\n  <script id="env-config">\n    window.ENV = Object.freeze(${JSON.stringify(clientEnv, null, 2)});\n  </script>`;
          return html.replace('</head>', `${scriptTag}\n</head>`);
        }
      },
      {
        name: 'local-api-functions',
        configureServer(server) {
          SERVER_ENV_KEYS.forEach(key => { if (env[key] && !process.env[key]) process.env[key] = env[key]; });
          mountApiFunctions(server.middlewares, file => server.ssrLoadModule(file));
        },
        configurePreviewServer(server) {
          SERVER_ENV_KEYS.forEach(key => { if (env[key] && !process.env[key]) process.env[key] = env[key]; });
          mountApiFunctions(server.middlewares, file => import(pathToFileURL(file).href));
        }
      }
    ]
  };
});
