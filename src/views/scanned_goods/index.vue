<template>
  <div class="page">
    <MenuTop title="Sync Queue" :showBack="true" />
    <div class="page-content">

      <!-- Sync status summary card -->
      <div class="card sync-summary-card">
        <div class="sync-summary-header">
          <div class="sync-summary-title">
            Sync Status
            <span class="online-dot" :class="isOnline ? 'dot-online' : 'dot-offline'"></span>
            <span class="online-label">{{ isOnline ? 'Online' : 'Offline' }}</span>
          </div>
          <div v-if="lastSyncTime" class="last-sync-label">
            {{ formatTime(lastSyncTime) }}
          </div>
        </div>
        <div class="summary-row">
          <div class="summary-item">
            <div class="summary-count count-pending">{{ outboxPending.length }}</div>
            <div class="summary-label">Pending</div>
          </div>
          <div class="summary-item">
            <div class="summary-count count-synced">{{ outboxConfirmed.length }}</div>
            <div class="summary-label">Synced</div>
          </div>
          <div class="summary-item">
            <div class="summary-count count-failed">{{ outboxFailed.length }}</div>
            <div class="summary-label">Failed</div>
          </div>
        </div>
      </div>

      <!-- Sync Now button -->
      <div v-if="outboxItems.length > 0" style="margin-bottom: 16px">
        <button class="btn btn-primary btn-block" @click="triggerSync"
          :disabled="syncRunning">
          {{ syncRunning ? 'Syncing...' : 'Sync Now (' + (outboxPending.length + outboxInFlight.length) + ')' }}
        </button>
      </div>

      <!-- Empty state -->
      <div v-if="outboxItems.length === 0" class="empty-state">
        <div class="empty-state-icon">&#128230;</div>
        <div>No items in the sync queue.</div>
      </div>

      <!-- Outbox items -->
      <div v-if="outboxItems.length > 0">
        <div class="section-label">SYNC QUEUE</div>

        <!-- Filter tabs -->
        <div class="filter-tabs">
          <button class="filter-tab" :class="{ active: filter === 'all' }" @click="filter = 'all'">
            All <span class="filter-count">{{ outboxItems.length }}</span>
          </button>
          <button class="filter-tab" :class="{ active: filter === 'pending' }" @click="filter = 'pending'">
            Pending <span class="filter-count">{{ outboxPending.length + outboxInFlight.length }}</span>
          </button>
          <button class="filter-tab" :class="{ active: filter === 'confirmed' }" @click="filter = 'confirmed'">
            Synced <span class="filter-count">{{ outboxConfirmed.length }}</span>
          </button>
          <button class="filter-tab" :class="{ active: filter === 'failed' }" @click="filter = 'failed'">
            Failed <span class="filter-count">{{ outboxFailed.length }}</span>
          </button>
        </div>

        <div class="list-group">
          <div v-for="item in filteredOutbox" :key="item.id" class="list-item sync-item">
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
        <div v-if="outboxConfirmed.length > 0" style="margin-top: 12px; text-align: center">
          <button class="btn btn-sm btn-outline" @click="clearConfirmed">
            Clear {{ outboxConfirmed.length }} synced item(s)
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import MenuTop from '../../components/menutop/index.vue';
import { store } from '../../util/store.js';
import {
  getPendingCount, getAllItems, initOutbox,
  retryItem, discardItem, purgeOldConfirmed,
} from '../../util/sync/outbox.js';
import { replayOutbox, onSyncProgress } from '../../util/sync/index.js';
import { addLogEntry } from '../../util/activityLog.js';

const filter = ref('all');
const syncRunning = ref(false);
const outboxItems = ref([]);
let unsubscribe = null;

const isOnline = computed(() => store.sync.isOnline);
const lastSyncTime = computed(() => store.sync.lastSyncTime);

const outboxPending = computed(() => outboxItems.value.filter(i => i.state === 'PENDING'));
const outboxInFlight = computed(() => outboxItems.value.filter(i => i.state === 'IN_FLIGHT'));
const outboxConfirmed = computed(() => outboxItems.value.filter(i => i.state === 'CONFIRMED'));
const outboxFailed = computed(() => outboxItems.value.filter(i => i.state === 'FAILED'));

const filteredOutbox = computed(() => {
  switch (filter.value) {
    case 'pending': return [...outboxPending.value, ...outboxInFlight.value];
    case 'confirmed': return outboxConfirmed.value;
    case 'failed': return outboxFailed.value;
    default: return outboxItems.value;
  }
});

// ─── Outbox Helpers ────────────────────────────────────

async function refreshOutbox() {
  try {
    await initOutbox();
    outboxItems.value = await getAllItems();
  } catch {
    // non-fatal
  }
}

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

// ─── Sync Now ──────────────────────────────────────────

async function triggerSync() {
  if (syncRunning.value) return;
  syncRunning.value = true;

  try {
    await initOutbox();
    const count = await getPendingCount();
    store.sync.pendingCount = count;

    if (count > 0) {
      addLogEntry('info', 'Starting sync...', `${count} pending item(s)`);
      await replayOutbox();
    } else {
      addLogEntry('info', 'No pending items to sync');
    }

    await refreshOutbox();
  } catch (err) {
    addLogEntry('error', `Sync failed: ${err.message}`);
  } finally {
    syncRunning.value = false;
  }
}

// ─── Outbox Item Actions ───────────────────────────────

async function retryOne(id) {
  await retryItem(id);
  addLogEntry('info', 'Item reset to pending', 'Will retry on next sync');
  await refreshOutbox();
}

async function discardOne(id) {
  await discardItem(id);
  addLogEntry('warning', 'Item discarded', 'Removed from outbox');
  await refreshOutbox();
  store.sync.pendingCount = await getPendingCount();
}

async function clearConfirmed() {
  const count = outboxConfirmed.value.length;
  await purgeOldConfirmed(0);
  addLogEntry('info', `Cleared ${count} synced item(s)`);
  await refreshOutbox();
}

// ─── Lifecycle ─────────────────────────────────────────

onMounted(async () => {
  await refreshOutbox();

  unsubscribe = onSyncProgress((progress) => {
    refreshOutbox();
    if (progress.status === 'idle') {
      addLogEntry('info', 'Sync complete',
        `${progress.confirmed} synced, ${progress.failed} failed`);
    } else if (progress.status === 'error') {
      addLogEntry('error', 'Sync ended with errors',
        `${progress.confirmed} synced, ${progress.failed} failed`);
    }
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
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

.sync-summary-card {
  border-left: 3px solid var(--color-primary);
}
.sync-summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.sync-summary-title {
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
.online-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
}
.last-sync-label {
  font-size: 11px;
  color: var(--color-text-secondary);
}
.summary-row {
  display: flex;
  gap: 16px;
}
.summary-item {
  flex: 1;
  text-align: center;
}
.summary-count {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}
.count-pending { color: var(--color-warning); }
.count-synced { color: var(--color-success); }
.count-failed { color: var(--color-error); }
.summary-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-secondary);
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

.sync-item {
  gap: 10px;
}
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
</style>
