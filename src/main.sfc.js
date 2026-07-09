import { bootstrapSfcApp } from './util/sfcBootstrap.js';

bootstrapSfcApp().then(({ createApp, Main, router }) => {
  const app = createApp(Main);
  if (router) app.use(router);
  app.mount('#app');
}).catch(err => console.error('App initialization failed:', err));
