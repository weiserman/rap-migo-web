<template>
  <div class="page">
    <MenuTop title="MIGO GR Scanner" :showBack="false" :showHome="false" />
    <div class="page-content">
      <div class="object-header">
        <div class="object-header-title">Goods Receipt Scanner</div>
        <div class="object-header-subtitle">Plant {{ store.plant }}</div>
      </div>

      <div v-if="stagingCount > 0" class="message-strip strip-info">
        <span class="message-strip-icon">&#9432;</span>
        <span>{{ stagingCount }} item(s) staged for posting</span>
      </div>

      <!-- Sync status card -->
      <div class="card sync-status-card">
        <div class="sync-status-header">
          <div class="sync-status-title">
            Sync Status
            <span class="online-dot" :class="isOnline ? 'dot-online' : 'dot-offline'"></span>
            <span class="sync-status-online-label">{{ isOnline ? 'Online' : 'Offline' }}</span>
          </div>
          <router-link to="/sync_status" class="sync-status-link">Details</router-link>
        </div>
        <div class="sync-status-counts">
          <div class="sync-count-item">
            <div class="sync-count-value count-pending">{{ syncPending }}</div>
            <div class="sync-count-label">Pending</div>
          </div>
          <div class="sync-count-item">
            <div class="sync-count-value count-confirmed">{{ confirmedCount }}</div>
            <div class="sync-count-label">Synced</div>
          </div>
          <div class="sync-count-item">
            <div class="sync-count-value count-failed">{{ failedCount }}</div>
            <div class="sync-count-label">Failed</div>
          </div>
        </div>
        <div v-if="syncError" class="sync-status-error">
          {{ syncError }}
        </div>
        <div v-if="syncPending > 0 || syncRunning" class="sync-status-action">
          <button class="btn btn-sm btn-primary" @click="triggerSync" :disabled="syncRunning" style="flex: 1">
            {{ syncRunning ? 'Syncing...' : 'Sync Now' }}
          </button>
        </div>
        <div v-if="lastSyncTime" class="sync-status-footer">
          Last sync: {{ formatTime(lastSyncTime) }}
        </div>
      </div>

      <div class="section-label">ACTIONS</div>
      <div class="list-group">
        <router-link to="/po_lookup" class="list-item">
          <div class="list-item-content">
            <div class="list-item-title">Scan / Enter PO</div>
            <div class="list-item-desc">Look up a purchase order by number</div>
          </div>
          <span class="nav-arrow">&#8250;</span>
        </router-link>

        <router-link to="/po_list" class="list-item">
          <div class="list-item-content">
            <div class="list-item-title">Browse PO List</div>
            <div class="list-item-desc">View open purchase orders for this plant</div>
          </div>
          <span class="nav-arrow">&#8250;</span>
        </router-link>

        <router-link v-if="stagingCount > 0" to="/scanned_goods" class="list-item">
          <div class="list-item-content">
            <div class="list-item-title">Review Staged Items</div>
            <div class="list-item-desc">{{ stagingCount }} item(s) ready to post</div>
          </div>
          <span class="object-status status-open">{{ stagingCount }}</span>
          <span class="nav-arrow">&#8250;</span>
        </router-link>

        <router-link to="/config" class="list-item">
          <div class="list-item-content">
            <div class="list-item-title">Configuration</div>
            <div class="list-item-desc">Server, credentials, plant settings</div>
          </div>
          <span class="nav-arrow">&#8250;</span>
        </router-link>

        <div class="list-item" @click="lockApp">
          <div class="list-item-content">
            <div class="list-item-title">Lock App</div>
            <div class="list-item-desc">Require PIN to re-enter</div>
          </div>
          <span class="nav-arrow">&#8250;</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import MenuTop from '../../components/menutop/index.vue';
import { store, storeActions } from '../../util/store.js';
import { useRouter } from 'vue-router';
import { replayOutbox, isSyncing, getPendingCount, initOutbox, getAllItems } from '../../util/sync/index.js';

const router = useRouter();
const stagingCount = computed(() => store.cache.stagingList.length);
const syncPending = computed(() => store.sync.pendingCount);
const syncError = computed(() => store.sync.syncError);
const isOnline = computed(() => store.sync.isOnline);
const lastSyncTime = computed(() => store.sync.lastSyncTime);
const syncRunning = ref(false);
const confirmedCount = ref(0);
const failedCount = ref(0);

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return 'Today ' + time;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

async function refreshCounts() {
  try {
    await initOutbox();
    const items = await getAllItems();
    confirmedCount.value = items.filter(i => i.state === 'CONFIRMED').length;
    failedCount.value = items.filter(i => i.state === 'FAILED').length;
    store.sync.pendingCount = await getPendingCount();
  } catch {
    // non-fatal
  }
}

async function triggerSync() {
  if (syncRunning.value) return;
  syncRunning.value = true;
  try {
    await initOutbox();
    const count = await getPendingCount();
    store.sync.pendingCount = count;
    if (count > 0) {
      await replayOutbox();
    }
    await refreshCounts();
  } catch (err) {
    console.error('[Sync] Manual sync failed:', err);
  } finally {
    syncRunning.value = false;
  }
}

function lockApp() {
  storeActions.logout();
  router.push('/enter');
}

onMounted(() => {
  refreshCounts();
});
</script>

<style scoped>
.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.8px;
  padding: 0 4px 8px;
}
.nav-arrow {
  color: var(--color-text-secondary);
  font-size: 20px;
  font-weight: 300;
  margin-left: 8px;
}

.sync-status-card {
  border-left: 3px solid var(--color-primary);
}
.sync-status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.sync-status-title {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.online-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.dot-online { background: var(--color-success); }
.dot-offline { background: var(--color-error); }
.sync-status-online-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
}
.sync-status-link {
  font-size: 12px;
  font-weight: 600;
}
.sync-status-counts {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
}
.sync-count-item {
  flex: 1;
  text-align: center;
}
.sync-count-value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}
.count-pending { color: var(--color-warning); }
.count-confirmed { color: var(--color-success); }
.count-failed { color: var(--color-error); }
.sync-count-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-secondary);
}
.sync-status-error {
  font-size: 12px;
  color: var(--color-error);
  background: var(--fiori-red-light);
  padding: 6px 10px;
  border-radius: 4px;
  margin-bottom: 8px;
}
.sync-status-action {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.sync-status-footer {
  font-size: 11px;
  color: var(--color-text-secondary);
}
</style>
