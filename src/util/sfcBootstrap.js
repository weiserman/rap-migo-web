/**
 * SFC bootstrap — loads Vue 3 + Router + SFC loader for production (zero-build) mode.
 * Implements a custom JS module pipeline that resolves .vue imports in .js files
 * by compiling them via vue3-sfc-loader and replacing import paths with blob URLs.
 *
 * All dependencies are vendored in src/lib/ — no CDN required.
 */

import { loadModule } from '../lib/vue3-sfc-loader/dist/vue3-sfc-loader.esm.js';
import * as Vue from '../lib/vue/vue.esm-browser.prod.js';

export async function bootstrapSfcApp() {
  // Bind Vue globally so vue-router IIFE and data-URI re-exports can find it
  window.Vue = Vue;

  // Load Vue Router as a global IIFE script (creates window.VueRouter)
  const routerRes = await fetch('./src/lib/vue-router/vue-router.global.prod.js');
  if (!routerRes.ok) throw new Error('Failed to load Vue Router global asset.');
  const routerCode = await routerRes.text();
  const script = document.createElement('script');
  script.textContent = routerCode;
  document.head.appendChild(script);

  const VueRouter = window.VueRouter;
  if (!VueRouter) throw new Error('Vue Router global not found after script injection.');

  // Cache for compiled .js modules (prevents re-fetching and re-compiling)
  const customJsCache = {};

  const options = {
    moduleCache: {
      vue: Vue,
      'vue-router': VueRouter,
    },

    async getFile(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load ${url}`);
      return {
        getContentData: (asBinary) => (asBinary ? res.arrayBuffer() : res.text()),
      };
    },

    addStyle(styleStr) {
      const style = document.createElement('style');
      style.textContent = styleStr;
      document.head.appendChild(style);
    },

    pathResolve({ refPath, relPath }) {
      if (!refPath) return relPath;
      if (relPath.startsWith('.')) {
        return refPath.substring(0, refPath.lastIndexOf('/') + 1) + relPath;
      }
      return relPath;
    },

    async handleModule(type, getContentData, path, opts) {
      if (path.endsWith('.js')) {
        async function resolveAndCacheModule(currentPath) {
          if (currentPath === 'vue') return { resolved: true, exports: Vue };
          if (currentPath === 'vue-router') return { resolved: true, exports: VueRouter };
          if (customJsCache[currentPath] && customJsCache[currentPath].resolved) {
            return customJsCache[currentPath];
          }

          customJsCache[currentPath] = { resolved: false, blobUrl: null, exports: null };
          const res = await fetch(currentPath);
          if (!res.ok) throw new Error(`Module fetch failed: ${currentPath}`);
          const rawCode = await res.text();

          // Resolve current directory for relative imports
          let cleanPath = currentPath.startsWith('.') ? currentPath.substring(1) : currentPath;
          const currentDirUrl = new URL(cleanPath, window.location.origin);

          // Find all import ... from '...' statements
          const importRegex = /from\s+['"](\.\.?\/[^'"]+|vue|vue-router)['"]/g;
          let match;
          const dependencies = [];
          while ((match = importRegex.exec(rawCode)) !== null) {
            const relPath = match[1];
            if (relPath === 'vue' || relPath === 'vue-router') {
              dependencies.push({ relPath, absoluteDependencyPath: relPath });
            } else {
              const resolvedUrl = new URL(relPath, currentDirUrl);
              const absoluteDependencyPath = '.' + resolvedUrl.pathname;
              dependencies.push({ relPath, absoluteDependencyPath });
            }
          }

          // Resolve each dependency
          for (const dep of dependencies) {
            if (dep.absoluteDependencyPath.endsWith('.vue')) {
              if (!customJsCache[dep.absoluteDependencyPath]) {
                customJsCache[dep.absoluteDependencyPath] = { resolved: false, blobUrl: null, exports: null };
                const vueComponent = await loadModule(dep.absoluteDependencyPath, options);
                if (!window.sfcComponentCache) window.sfcComponentCache = {};
                window.sfcComponentCache[dep.absoluteDependencyPath] = vueComponent;
                const compBlob = new Blob(
                  [`export default window.sfcComponentCache["${dep.absoluteDependencyPath}"];`],
                  { type: 'text/javascript' }
                );
                customJsCache[dep.absoluteDependencyPath].blobUrl = URL.createObjectURL(compBlob);
                customJsCache[dep.absoluteDependencyPath].exports = { default: vueComponent };
                customJsCache[dep.absoluteDependencyPath].resolved = true;
              }
            } else if (dep.absoluteDependencyPath !== 'vue' && dep.absoluteDependencyPath !== 'vue-router') {
              await resolveAndCacheModule(dep.absoluteDependencyPath);
            }
          }

          // Transform import paths in the code
          let transformedCode = rawCode.replace(
            /from\s+['"](\.\.?\/[^'"]+|vue|vue-router)['"]/g,
            (m, relPath) => {
              if (relPath === 'vue') {
                return `from 'data:text/javascript,export default window.Vue; export * from "data:text/javascript,const {reactive,ref,computed,watch,onMounted,onUnmounted,defineComponent,createApp,nextTick,toRaw,shallowRef,watchEffect,inject,provide,h,defineAsyncComponent}=window.Vue; export {reactive,ref,computed,watch,onMounted,onUnmounted,defineComponent,createApp,nextTick,toRaw,shallowRef,watchEffect,inject,provide,h,defineAsyncComponent};";'`;
              }
              if (relPath === 'vue-router') {
                return `from 'data:text/javascript,export default window.VueRouter; export * from "data:text/javascript,const {createRouter,createWebHashHistory,createWebHistory,useRoute,useRouter}=window.VueRouter; export {createRouter,createWebHashHistory,createWebHistory,useRoute,useRouter};";'`;
              }
              const resolvedUrl = new URL(relPath, currentDirUrl);
              const absoluteDependencyPath = '.' + resolvedUrl.pathname;
              const cachedDep = customJsCache[absoluteDependencyPath];
              if (cachedDep && cachedDep.blobUrl) {
                return `from '${cachedDep.blobUrl}'`;
              }
              return `from '${resolvedUrl.pathname}'`;
            }
          );

          // Create blob URL and evaluate as ES module
          const blob = new Blob([transformedCode], { type: 'text/javascript' });
          const blobUrl = URL.createObjectURL(blob);
          customJsCache[currentPath].blobUrl = blobUrl;
          const evaluatedModule = await import(blobUrl);
          customJsCache[currentPath].resolved = true;
          customJsCache[currentPath].exports = evaluatedModule;
          return customJsCache[currentPath];
        }

        const moduleData = await resolveAndCacheModule(path);
        return moduleData.exports;
      }
      // For non-.js types, return undefined to let vue3-sfc-loader use its default handler
    },
  };

  // Expose options globally for the custom pipeline to access
  window.sfcLoaderOptions = options;

  // Compile Main.vue via SFC loader
  const MainComponent = await loadModule('./src/Main.vue', options);

  // Load router via custom JS module pipeline (resolves .vue imports)
  const routerModule = await options.handleModule('.js', null, './src/router/index.js', options);

  return {
    createApp: Vue.createApp,
    Main: MainComponent,
    router: routerModule && routerModule.default ? routerModule.default : null,
  };
}
