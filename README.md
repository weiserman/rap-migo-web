# MIGO GR Scanner — Web App

Vue 3 single-page application for mobile goods receipt scanning against the SAP S/4HANA ZUI_MIGO_GR_V4 OData V4 service.

Deployed as the web layer inside the [Android Hybrid Mobile (AHM)](https://github.com/otvnvs/android-hybrid-mobile) framework via OTA updates or ADB push.

## OTA Deployment

This is a **public** repository. Point the AHM maintenance panel's update URL at:

```
https://github.com/weiserman/rap-migo-web/archive/refs/heads/main.zip
```

- No authentication required (public repo)
- The AHM UpdateManager auto-strips the `rap-migo-web-main/` wrapper folder
- Enable auto-update with any interval for hands-free deployments

## Project Structure

```
index.html          ← SFC production entry (vue3-sfc-loader, zero-build)
error.html          ← APK Tier 3 fallback page
src/
  main.sfc.js       ← SFC bootstrap
  Main.vue           ← Root component
  router/            ← Vue Router (hash history, PIN guard)
  util/              ← Store, OData client, Entity service, SFC loader
  components/        ← MenuTop, CustomDialog
  lib/               ← Vendored Vue 3, Vue Router, vue3-sfc-loader
  views/             ← 10 screens (PIN, Home, Config, PO list, Items, GR posting)
```

## Vendored Dependencies (offline-capable)

| Package | File | Size |
|---------|------|------|
| Vue 3 | `src/lib/vue/vue.esm-browser.prod.js` | 168 KB |
| Vue Router 4 | `src/lib/vue-router/vue-router.esm-browser.js` | 100 KB |
| vue3-sfc-loader | `src/lib/vue3-sfc-loader/dist/vue3-sfc-loader.esm.js` | 1.8 MB |

All runtime dependencies are shipped inline — the app runs fully offline with zero CDN dependency.

## ADB Deployment (development)

```bash
adb push index.html /sdcard/Documents/MigoGR/www/
adb push error.html /sdcard/Documents/MigoGR/www/
adb push src/ /sdcard/Documents/MigoGR/www/src/
```

## Syncing from Source

The source of truth lives in `rap-mobile/web/`. To sync changes:

```bash
cd rap-mobile/web
cp index.html error.html ../rap-migo-web/
cp -r src/ ../rap-migo-web/
cd ../rap-migo-web
git add -A && git commit -m "sync from rap-mobile" && git push
```
