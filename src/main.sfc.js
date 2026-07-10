import { bootstrapSfcApp } from './util/sfcBootstrap.js';

// Load global CSS (compatible with all WebView versions, no CSS module syntax needed)
fetch('./src/style.css')
  .then((res) => {
    if (!res.ok) throw new Error('Failed to load style.css');
    return res.text();
  })
  .then((css) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  })
  .catch((err) => console.error('CSS load failed:', err));

bootstrapSfcApp()
  .then(async ({ createApp, Main, router }) => {
    const app = createApp(Main);
    if (router) app.use(router);
    app.mount('#app');

    // Start sync engine — initializes outbox DB, recovers in-flight items,
    // and begins replaying pending transactions
    try {
      const { startSyncEngine } = await import('./util/sync/engine.js');
      await startSyncEngine();
    } catch (err) {
      console.error('[Sync] Engine startup failed:', err);
    }
  })
  .catch((err) => console.error('App initialization failed:', err));
