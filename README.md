# MIGO GR Scanner — Web App

Vue 3 single-page application for mobile goods receipt scanning against the SAP S/4HANA ZUI_MIGO_GR_V4 OData V4 service.

Deployed as the web layer inside the [Android Hybrid Mobile (AHM)](https://github.com/otvnvs/android-hybrid-mobile) framework via OTA updates or ADB push.

## Deployment

This repo is the OTA update source for the AHM APK. Point the maintenance panel's update URL at:

```
https://github.com/weiserman/rap-migo-web/archive/refs/heads/main.zip
```

The AHM UpdateManager auto-strips the `rap-migo-web-main/` wrapper folder from the GitHub ZIP.

## Structure

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

## Development

The source of truth lives in `rap-mobile/web/`. To sync changes here:

```bash
cd rap-mobile/web
cp index.html error.html ../rap-migo-web/
cp -r src/ ../rap-migo-web/
cd ../rap-migo-web
git add -A && git commit -m "sync from rap-mobile" && git push
```
