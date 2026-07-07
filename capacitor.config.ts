// Capacitor config — present per spec §16, intentionally NOT built for v1.
// When we're ready to wrap for stores:
//   npm i @capacitor/core && npm i -D @capacitor/cli
//   npm run build
//   npx cap add android   (and/or ios)
// This file will be picked up as-is; no refactor needed.
const config = {
  appId: 'com.roguelite.survivors',
  appName: 'RogueLite Survivors',
  webDir: 'dist',
};

export default config;
