/**
 * Reactive store for MIGO GR module.
 * Uses window.__GLOBAL_APP_STORE__ pattern for SFC compatibility.
 */
import { reactive, watch } from 'vue';

const STORAGE_KEY = 'migo_gr_store';

const defaultState = {
  user: {
    name: 'User',
    isLoggedIn: false,
  },
  appPin: null,
  config: {
    baseHost: 'https://s4hana2025.professorsoft.com:44300',
    poPath: '/sap/opu/odata4/sap/zui_migo_gr_v4/srvd_a2x/sap/zui_migo_gr_v4/0001',
    grPath: '/sap/opu/odata4/sap/zui_migo_gr_v4/srvd_a2x/sap/zui_migo_gr_v4/0001',
    username: '',
    password: '',
    networkTimeoutMs: 30000,
    sapClient: '100',
  },
  plant: '1010',
  cache: {
    poList: [],
    poListCount: 0,
    selectedPO: null,
    deliveryCache: {},
    stagingList: [],
    postingResults: [],
    postingInProgress: false,
    poHistory: [],
  },
};

const getInitialState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { ...defaultState };
    const parsed = JSON.parse(saved);
    // Merge with defaults for schema migration
    parsed.config = { ...defaultState.config, ...(parsed.config || {}) };
    parsed.user.isLoggedIn = false;
    return parsed;
  } catch {
    return { ...defaultState };
  }
};

if (!window.__GLOBAL_APP_STORE__) {
  window.__GLOBAL_APP_STORE__ = reactive(getInitialState());
  watch(
    () => window.__GLOBAL_APP_STORE__,
    (newState) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    },
    { deep: true }
  );
}

export const store = window.__GLOBAL_APP_STORE__;

export const storeActions = {
  saveNewPin(pin) {
    store.appPin = pin;
  },
  login() {
    store.user.isLoggedIn = true;
  },
  logout() {
    store.user.isLoggedIn = false;
  },
  saveODataConfig(baseHost, poPath, grPath, user, pass, timeoutMs, sapClient) {
    store.config.baseHost = baseHost;
    store.config.poPath = poPath;
    store.config.grPath = grPath;
    store.config.username = user;
    store.config.password = pass;
    store.config.networkTimeoutMs = timeoutMs || 15000;
    store.config.sapClient = sapClient || '100';
  },
  setPlant(plant) {
    store.plant = plant;
  },
  setSelectedPO(po) {
    store.cache.selectedPO = po;
    store.cache.stagingList = [];
  },
  cacheItems(poNumber, items) {
    store.cache.deliveryCache[poNumber] = { items, loaded: true };
  },
  updateCachedItems(poNumber, items) {
    if (store.cache.deliveryCache[poNumber]) {
      store.cache.deliveryCache[poNumber].items = items;
    }
  },
  addToStaging(item) {
    const existing = store.cache.stagingList.find(
      (s) =>
        s.PurchaseOrder === item.PurchaseOrder &&
        s.PurchaseOrderItem === item.PurchaseOrderItem
    );
    if (existing) {
      existing.recptQty = item.recptQty;
    } else {
      store.cache.stagingList.push({ ...item });
    }
  },
  removeFromStaging(purchaseOrder, purchaseOrderItem) {
    const idx = store.cache.stagingList.findIndex(
      (s) =>
        s.PurchaseOrder === purchaseOrder &&
        s.PurchaseOrderItem === purchaseOrderItem
    );
    if (idx >= 0) store.cache.stagingList.splice(idx, 1);
  },
  clearStaging() {
    store.cache.stagingList.splice(0);
  },
  setPostingResults(results) {
    store.cache.postingResults = results;
  },
  setPostingInProgress(val) {
    store.cache.postingInProgress = val;
  },
  clearPostingResults() {
    store.cache.postingResults = [];
  },
  addToPoHistory(po) {
    const entry = {
      PurchaseOrder: po.PurchaseOrder,
      SupplierName: po.SupplierName || '',
      Plant: po.Plant || '',
      timestamp: Date.now(),
    };
    // Remove duplicate if exists
    const idx = store.cache.poHistory.findIndex(
      (h) => h.PurchaseOrder === entry.PurchaseOrder
    );
    if (idx >= 0) store.cache.poHistory.splice(idx, 1);
    // Add to front, keep max 5
    store.cache.poHistory.unshift(entry);
    if (store.cache.poHistory.length > 5) {
      store.cache.poHistory.splice(5);
    }
  },
  clearPoHistory() {
    store.cache.poHistory.splice(0);
  },
  /**
   * Reset all store data to defaults (used by Forgot PIN).
   */
  resetStore() {
    store.appPin = null;
    store.user.isLoggedIn = false;
    store.user.name = 'User';
    store.config = { ...defaultState.config };
    store.plant = defaultState.plant;
    store.cache = { ...defaultState.cache };
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  },
  exportConfigQR() {
    return JSON.stringify({
      baseHost: store.config.baseHost,
      poPath: store.config.poPath,
      grPath: store.config.grPath,
      sapClient: store.config.sapClient,
      plant: store.plant,
    });
  },
  importConfigQR(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (data.baseHost) store.config.baseHost = data.baseHost;
    if (data.poPath) store.config.poPath = data.poPath;
    if (data.grPath) store.config.grPath = data.grPath;
    if (data.sapClient) store.config.sapClient = data.sapClient;
    if (data.plant) store.plant = data.plant;
  },
};
