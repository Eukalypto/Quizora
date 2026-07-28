import type { CapacitorConfig } from '@capacitor/cli';

// Quizora is a full TanStack Start SSR app — auth (Clerk middleware) and all
// game data (D1 via server functions) require the live Worker. There's no
// standalone index.html to bundle locally (every route falls through to SSR
// — see wrangler.jsonc), so the WebView loads the deployed app directly
// instead of a local `webDir` bundle.
const config: CapacitorConfig = {
  appId: 'com.eukalypto.quizora',
  appName: 'Quizora',
  webDir: 'mobile-shell',
  server: {
    url: 'https://quizora.quizora.workers.dev',
    cleartext: false,
  },
};

export default config;
