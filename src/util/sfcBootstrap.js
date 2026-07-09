/**
 * SFC bootstrap — loads Vue 3 + Router for production (zero-build) mode.
 * All dependencies are vendored in src/lib/ — no CDN required.
 * Uses vue3-sfc-loader to compile .vue files in the browser.
 */

export async function bootstrapSfcApp() {
  // Load Vue from import map (resolves to src/lib/vue/vue.esm-browser.prod.js)
  const vueModule = await import('vue');
  const { createApp, defineComponent } = vueModule;

  // Load Vue Router from local vendored lib (not importmap — avoids ESM issues)
  const routerModule = await import('../lib/vue-router/vue-router.esm-browser.js');

  // Load Main.vue via vendored vue3-sfc-loader
  let Main;
  try {
    const { loadModule } = await import('../lib/vue3-sfc-loader/dist/vue3-sfc-loader.esm.js');
    const options = {
      moduleCache: { vue: vueModule },
      getFile: async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load ${url}`);
        return res.text();
      },
      addStyle: (textContent) => {
        const style = document.createElement('style');
        style.textContent = textContent;
        document.head.appendChild(style);
      },
    };
    Main = await loadModule('./Main.vue', options);
  } catch (err) {
    console.error('SFC loader failed, using fallback component:', err);
    Main = defineComponent({
      template: '<div id="app" style="color:#ff4d4d;text-align:center;padding:40px"><h2>MIGO GR Scanner</h2><p>Failed to load application modules.</p><p style="color:#a0a0a0;font-size:0.9rem">Check that all .vue files are deployed in the www/ directory.</p></div>',
    });
  }

  // Build router from local router config, injecting vue-router
  let router;
  try {
    const routerConfig = await import('../router/index.js');
    router = routerConfig.default;
  } catch (err) {
    console.error('Router load failed:', err);
  }

  return { createApp, Main, router };
}
