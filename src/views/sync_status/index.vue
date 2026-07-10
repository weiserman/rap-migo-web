<template>
  <div class="page">
    <MenuTop title="Sync Status" :showBack="true" />
    <div class="page-content">

      <!-- Summary counts card -->
      <div class="card sync-summary-card">
        <div class="summary-row">
          <div class="summary-item">
            <div class="summary-count" style="color: var(--color-warning)">{{ pendingItems.length }}</div>
            <div class="summary-label">Pending</div>
          </div>
          <div class="summary-item">
            <div class="summary-count" style="color: var(--color-primary)">{{ inFlightItems.length }}</div>
            <div class="summary-label">Syncing</div>
          </div>
          <div class="summary-item">
            <div class="summary-count" style="color: var(--color-success)">{{ confirmedItems.length }}</div>
            <div class="summary-label">Synced</div>
          </div>
          <div class="summary-item">
            <div class="summary-count" style="color: var(--color-error)">{{ failedItems.length }}</div>
            <div class="summary-label">Failed</div>
          </div>
        </div>
        <div v-if="lastSync" class="summary-footer">
          Last sync: {{ formatTime(lastSync) }}
        </div>
        <div v-if="!isOnline" class="summary-footer" style="color: var(--color-error)">
          Device is offline
        </div>
      </div>

      <!-- Action buttons -->
      <div style="display: flex; gap: 8px; margin-bottom: 12px">
        <button class="btn btn-primary" style="flex: 1" @click="triggerSync" :disabled="syncRunning || pendingItems.length === 0">
          {{ syncRunning ? 'Syncing...' : 'Sync Now' }}
        </button>
        <button class="btn btn-outline" style="flex: 1" @click="refreshList">
          Refresh
        </button>
      </div>

      <!-- Filter tabs -->
      <div class="filter-tabs">
        <button class="filter-tab" :class="{ active: filter === 'all' }" @click="filter = 'all'">
          All <span class="filter-count">{{ allItems.length }}</span>
        </button>
        <button class="filter-tab" :class="{ active: filter === 'pending' }" @click="filter = 'pending'">
          Pending <span class="filter-count">{{ pendingItems.length }}</span>
        </button>
        <button class="filter-tab" :class="{ active: filter === 'confirmed' }" @click="filter = 'confirmed'">
          Synced <span class="filter-count">{{ confirmedItems.length }}</span>
        </button>
        <button class="filter-tab" :class="{ active: filter === 'failed' }" @click="filter = 'failed'">
          Failed <span class="filter-count">{{ failedItems.length }}</span>
        </button>
      </div>

      <!-- Item list -->
      <div v-if="filteredItems.length === 0" class="empty-state">
        <div class="empty-state-icon">&#128230;</div>
        <div>No {{ filter === 'all' ? '' : filter }} items</div>
      </div>

      <div v-else class="list-group">
        <div v-for="item in filteredItems" :key="item.id" class="list-item sync-item">
          <div class="sync-status-dot" :class="'dot-' + stateClass(item.state)"></div>
          <div class="list-item-content">
            <div class="list-item-title">
              PO {{ item.po_number }}
              <span class="object-status" :class="'status-' + stateClass(item.state)">
                {{ stateLabel(item.state) }}
              </span>
            </div>
            <div class="list-item-desc">
              {{ formatTime(item.created_at) }}
              <span v-if="item.attempts > 0"> &middot; {{ item.attempts }} attempt(s)</span>
            </div>
            <div v-if="item.state === 'CONFIRMED' && item.result_json" class="sync-result-detail">
              {{ parseResult(item.result_json) }}
            </div>
            <div v-if="item.state === 'FAILED' && item.error_msg" class="sync-error-detail">
              {{ item.error_msg }}
            </div>
          </div>
          <div class="sync-item-actions">
            <button v-if="item.state === 'FAILED'" class="btn btn-sm btn-outline" @click.stop="retryOne(item.id)">
              Retry
            </button>
            <button v-if="item.state !== 'IN_FLIGHT'" class="btn btn-sm btn-text" @click.stop="discardOne(item.id)">
              &#10005;
            </button>
          </div>
        </div>
      </div>

      <!-- Clear confirmed -->
      <div v-if="confirmedItems.length > 0" style="margin-top: 16px; text-align: center">
        <button class="btn btn-sm btn-outline" @click="clearConfirmed">
          Clear {{ confirmedItems.length }} synced item(s)
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import MenuTop from '../../components/menutop/index.vue';
import { store } from '../../util/store.js';
import {
  initOutbox, getAllItems, getPendingCount, getFailedItems,
  retryItem, discardItem, purgeOldConfirmed,
} from '../../util/sync/outbox.js';
import { replayOutbox, isSyncing, onSyncProgress } from '../../util/sync/index.js';

const filter = ref('all');
const allItems = ref([]);
const syncRunning = ref(false);
const isOnline = computed(() => store.sync.isOnline);
const lastSync = computed(() => store.sync.lastSyncTime);
let unsubscribe = null;

const pendingItems = computed(() => allItems.value.filter(i => i.state === 'PENDING'));
const inFlightItems = computed(() => allItems.value.filter(i => i.state === 'IN_FLIGHT'));
const confirmedItems = computed(() => allItems.value.filter(i => i.state === 'CONFIRMED'));
const failedItems = computed(() => allItems.value.filter(i => i.state === 'FAILED'));

const filteredItems = computed(() => {
  switch (filter.value) {
    case 'pending': return [...pendingItems.value, ...inFlightItems.value];
    case 'confirmed': return confirmedItems.value;
    case 'failed': return failedItems.value;
    default: return allItems.value;
  }
});

function stateClass(state) {
  switch (state) {
    case 'PENDING': return 'warning';
    case 'IN_FLIGHT': return 'open';
    case 'CONFIRMED': return 'success';
    case 'FAILED': return 'error';
    default: return 'open';
  }
}

function stateLabel(state) {
  switch (state) {
    case 'PENDING': return 'Pending';
    case 'IN_FLIGHT': return 'Syncing';
    case 'CONFIRMED': return 'Synced';
    case 'FAILED': return 'Failed';
    default: return state;
  }
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return 'Today ' + time;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday ' + time;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

function parseResult(json) {
  try {
    const r = JSON.parse(json);
    if (r.materialDocument) return 'Mat.Doc ' + r.materialDocument + (r.materialDocumentYear ? ' / ' + r.materialDocumentYear : '');
    return JSON.stringify(r);
  } catch {
    return json || '';
  }
}

async function refreshList() {
  try {
    await initOutbox();
    allItems.value = await getAllItems();
  } catch (err) {
    console.error('[Sync] Failed to refresh:', err);
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
    await refreshList();
  } catch (err) {
    console.error('[Sync] Manual sync failed:', err);
  } finally {
    syncRunning.value = false;
  }
}

async function retryOne(id) {
  await retryItem(id);
  await refreshList();
}

async function discardOne(id) {
  await discardItem(id);
  await refreshList();
  store.sync.pendingCount = await getPendingCount();
}

async function clearConfirmed() {
  await purgeOldConfirmed(0);
  await refreshList();
}

onMounted(async () => {
  await refreshList();
  unsubscribe = onSyncProgress(async () => {
    await refreshList();
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});
</script>

<style scoped>
.sync-summary-card {
  text-align: center;
}
.summary-row {
  display: flex;
  justify-content: center;
  gap: 20px;
}
.summary-item {
  min-width: 56px;
}
.summary-count {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}
.summary-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.summary-footer {
  margin-top: 10px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.filter-tabs {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: 12px;
}
.filter-tab {
  flex: 1;
  padding: 8px 4px;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-stack);
  border: none;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background 0.15s;
  border-right: 1px solid var(--color-border);
}
.filter-tab:last-child { border-right: none; }
.filter-tab.active {
  background: var(--fiori-blue-light);
  color: var(--color-primary);
}
.filter-count {
  font-weight: 400;
  margin-left: 2px;
  opacity: 0.7;
}

.sync-item {
  gap: 10px;
}
.sync-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}
.dot-warning { background: var(--color-warning); }
.dot-open { background: var(--color-primary); }
.dot-success { background: var(--color-success); }
.dot-error { background: var(--color-error); }

.sync-result-detail {
  font-size: 12px;
  color: var(--color-success);
  margin-top: 2px;
}
.sync-error-detail {
  font-size: 12px;
  color: var(--color-error);
  margin-top: 2px;
  white-space: pre-line;
}
.sync-item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.btn-text {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 14px;
  padding: 4px 8px;
  cursor: pointer;
  font-family: var(--font-stack);
}
.btn-text:hover {
  color: var(--color-error);
}
</style>
