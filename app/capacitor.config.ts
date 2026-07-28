import type { CapacitorConfig } from '@capacitor/cli';

// The UI ships bundled in the app (webDir: mobile-shell, built by
// `bun run build:mobile-shell` — see scripts/build-mobile-shell.mjs): a
// static prerendered shell for /app plus the client JS/CSS bundle, no
// remote server.url. Game data and auth still require the internet — every
// server-function/API call is redirected to the live Worker at request
// time (src/lib/native-shell.ts, src/start.ts's CORS + Bearer-token
// handling), since this bundle's own origin (capacitor://localhost on iOS,
// https://localhost on Android) has no server behind it.
const config: CapacitorConfig = {
  appId: 'com.eukalypto.quizora',
  appName: 'Quizora',
  webDir: 'mobile-shell',
};

export default config;
