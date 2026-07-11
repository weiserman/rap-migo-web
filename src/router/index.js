import { createRouter, createWebHashHistory } from 'vue-router';
import { store } from '../util/store.js';

import Home from '../views/home/index.vue';
import Config from '../views/config/index.vue';
import PoList from '../views/po_list/index.vue';
import PoItems from '../views/po_items/index.vue';
import PoLookup from '../views/po_lookup/index.vue';
import ReceiptItem from '../views/receipt_item/index.vue';
import ScannedGoods from '../views/scanned_goods/index.vue';
import Scanner from '../views/scanner/index.vue';
import ActivityLog from '../views/activity_log/index.vue';
import PostingResults from '../views/posting_results/index.vue';
import SyncStatus from '../views/sync_status/index.vue';
import PinSetup from '../views/pinsetup/index.vue';
import PinEnter from '../views/pinenter/index.vue';

const routes = [
  { path: '/', redirect: '/home' },
  { name: 'setup', path: '/setup', component: PinSetup },
  { name: 'enter', path: '/enter', component: PinEnter },
  { name: 'home', path: '/home', component: Home },
  { name: 'config', path: '/config', component: Config },
  { name: 'po_list', path: '/po_list', component: PoList },
  { name: 'po_lookup', path: '/po_lookup', component: PoLookup },
  { name: 'po_items', path: '/po_items/:poNumber', component: PoItems, props: true },
  { name: 'receipt_item', path: '/receipt_item/:itemId', component: ReceiptItem, props: true },
  { name: 'scanned_goods', path: '/scanned_goods', component: ScannedGoods },
  { name: 'scanner', path: '/scanner', component: Scanner },
  { name: 'activity_log', path: '/activity_log', component: ActivityLog },
  { name: 'posting_results', path: '/posting_results', component: PostingResults },
  { name: 'sync_status', path: '/sync_status', component: SyncStatus },
  { path: '/:catchAll(.*)*', redirect: '/home' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach((to, from, next) => {
  const pinExists = store.appPin !== null && store.appPin !== undefined && store.appPin !== '';
  const isLoggedIn = store.user.isLoggedIn === true;

  if (!pinExists) {
    if (to.path !== '/setup') return next('/setup');
    return next();
  }

  if (!isLoggedIn) {
    if (to.path !== '/enter') return next('/enter');
    return next();
  }

  if (to.path === '/setup' || to.path === '/enter') {
    return next('/home');
  }

  next();
});

export default router;
