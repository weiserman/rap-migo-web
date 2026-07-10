<template>
  <div class="page">
    <MenuTop title="Staged Items" :showBack="true" />
    <div class="page-content">

      <!-- Sync status summary card -->
      <div class="card sync-summary-card">
        <div class="sync-summary-header">
          <div class="sync-summary-title">
            Sync Status
            <span class="online-dot" :class="isOnline ? 'dot-online' : 'dot-offline'"></span>
            <span class="online-label">{{ isOnline ? 'Online' : 'Offline' }}</span>
          </div>
          <div class="sync-summary-actions">
            <button class="btn btn-sm btn-primary" @click="triggerSync" :disabled="syncRunning || totalPending === 0">
              {{ syncRunning ? 'Syncing...' : 'Sync Now' }}
            </button>
          </div>
        </div>
        <div class="summary-row">
          <div class="summary-item">
            <div class="summary-count count-staged">{{ stagingList.length }}</div>
            <div class="summary-label">Staged</div>
          </div>
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

      <!-- Staged items (pre-outbox, not yet confirmed) -->
      <div v-if="stagingList.length > 0">
        <div class="section-label">STAGED &mdash; NOT YET QUEUED</div>
        <div class="list-group">
          <div v-for="(item, idx) in stagingList" :key="'staged-' + idx" class="list-item staged-item">
            <div class="sync-status-dot dot-staged"></div>
            <div class="list-item-content">
              <div class="list-item-title">
                {{ item.Material }}
                <span class="object-status status-open">Staged</span>
              </div>
              <div class="list-item-desc">
                Item {{ item.PurchaseOrderItem }} &middot;
                Qty: {{ item.recptQty }} {{ item.OrderUnit }}
              </div>
              <div v-if="item.postingDate" class="list-item-desc" style="margin-top: 2px">
                Posting date: {{ item.postingDate }}
              </div>
            </div>
            <button class="btn btn-error btn-sm" @click="removeItem(idx)">Remove</button>
          </div>
        </div>

        <!-- Confirm staging action -->
        <div style="margin-top: 12px">
          <div class="card" style="text-align: center">
            <div style="font-size: 14px; margin-bottom: 4px; font-weight: 600">
              {{ stagingList.length }} item(s) ready to queue
            </div>
            <div style="font-size: 12px; color: var(--color-text-secondary)">
              PO {{ selectedPO?.PurchaseOrder || '' }} &middot; Plant {{ selectedPO?.Plant || '' }}
            </div>
          </div>

          <button v-if="!confirmVisible && !staging" class="btn btn-success btn-block" @click="showConfirm">
            Queue for Posting
          </button>

          <div v-if="confirmVisible && !staging" class="confirm-group">
            <div class="message-strip strip-warning" style="margin-bottom: 12px">
              <span class="message-strip-icon">&#9888;</span>
              <span>Queue {{ stagingList.length }} item(s) for posting? Items will be saved and posted in the background.</span>
            </div>
            <div style="display: flex; gap: 12px">
              <button class="btn btn-outline" style="flex: 1" @click="confirmVisible = false">Cancel</button>
              <button class="btn btn-success" style="flex: 1" @click="doPost">Confirm &amp; Queue</button>
            </div>
          </div>

          <div v-if="staging" style="text-align: center">
            <button class="btn btn-success btn-block" disabled>Queuing...</button>
          </div>
        </div>
      </div>

      <!-- Empty state when nothing staged and nothing in outbox -->
      <div v-if="stagingList.length === 0 && outboxItems.length === 0" class="empty-state">
        <div class="empty-state-icon">&#128230;</div>
        <div>No items staged or queued. Go back and add items.</div>
      </div>

      <!-- Outbox items (post-confirm, tracking sync state) -->
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
import { useRouter } from 'vue-router';
import MenuTop from '../../components/menutop/index.vue';
import { store, storeActions } from '../../util/store.js';
import { buildGRBody } from '../../util/entities.js';
import {
  enqueue, getPendingCount, getAllItems, initOutbox,
  retryItem, discardItem, purgeOldConfirmed,
} from '../../util/sync/outbox.js';
import { replayOutbox, isSyncing, onSyncProgress } from '../../util/sync/index.js';

const router = useRouter();
const staging = ref(false);
const confirmVisible = ref(false);
const filter = ref('all');
const syncRunning = ref(false);
const outboxItems = ref([]);
let unsubscribe = null;

const stagingList = computed(() => store.cache.stagingList);
const selectedPO = computed(() => store.cache.selectedPO);
const isOnline = computed(() => store.sync.isOnline);

const outboxPending = computed(() => outboxItems.value.filter(i => i.state === 'PENDING'));
const outboxInFlight = computed(() => outboxItems.value.filter(i => i.state === 'IN_FLIGHT'));
const outboxConfirmed = computed(() => outboxItems.value.filter(i => i.state === 'CONFIRMED'));
const outboxFailed = computed(() => outboxItems.value.filter(i => i.state === 'FAILED'));
const totalPending = computed(() => stagingList.value.length + outboxPending.value.length + outboxInFlight.value.length);

const filteredOutbox = computed(() => {
  switch (filter.value) {
    case 'pending': return [...outboxPending.value, ...outboxInFlight.value];
    case 'confirmed': return outboxConfirmed.value;
    case 'failed': return outboxFailed.value;
    default: return outboxItems.value;
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

async function refreshOutbox() {
  try {
    await initOutbox();
    outboxItems.value = await getAllItems();
  } catch {
    // non-fatal
  }
}

function removeItem(idx) {
  const item = stagingList.value[idx];
  storeActions.removeFromStaging(item.PurchaseOrder, item.PurchaseOrderItem);
}

function showConfirm() {
  if (!selectedPO.value || stagingList.value.length === 0) return;
  confirmVisible.value = true;
}

async function doPost() {
  confirmVisible.value = false;
  staging.value = true;

  try {
    const poHeader = selectedPO.value;
    const items = stagingList.value;
    const operatorId = store.user.name || 'unknown';

    for (const item of items) {
      const payload = buildGRBody(item, poHeader);
      await enqueue({
        id: payload.PostingID,
        operator_id: operatorId,
        po_number: poHeader.PurchaseOrder,
        payload: payload,
      });
    }

    storeActions.clearStaging();

    const pendingCount = await getPendingCount();
    store.sync.pendingCount = pendingCount;

    storeActions.setPostingResults(
      items.map((item) => ({
        success: true,
        postingId: item.PurchaseOrderItem,
        message: 'Queued for posting',
        PurchaseOrder: poHeader.PurchaseOrder,
        PurchaseOrderItem: item.PurchaseOrderItem,
        Material: item.Material,
      }))
    );

    try {
      const { EntityService } = await import('../../util/entities.js');
      await EntityService.refreshPoItems(poHeader.PurchaseOrder);
    } catch {
      // non-fatal
    }

    // Refresh the outbox list immediately
    await refreshOutbox();

    // Trigger sync engine replay (runs in background)
    if (!isSyncing()) {
      replayOutbox();
    }
  } catch (err) {
    alert(`Failed to queue items: ${err.message}`);
  } finally {
    staging.value = false;
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
    await refreshOutbox();
  } catch (err) {
    console.error('[Sync] Manual sync failed:', err);
  } finally {
    syncRunning.value = false;
  }
}

async function retryOne(id) {
  await retryItem(id);
  await refreshOutbox();
}

async function discardOne(id) {
  await discardItem(id);
  await refreshOutbox();
  store.sync.pendingCount = await getPendingCount();
}

async function clearConfirmed() {
  await purgeOldConfirmed(0);
  await refreshOutbox();
}

onMounted(async () => {
  await refreshOutbox();
  unsubscribe = onSyncProgress(async () => {
    await refreshOutbox();
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

/* Sync summary card */
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
.count-staged { color: var(--color-primary); }
.count-pending { color: var(--color-warning); }
.count-synced { color: var(--color-success); }
.count-failed { color: var(--color-error); }
.summary-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-secondary);
}

/* Staged items */
.staged-item {
  gap: 10px;
}

/* Sync status dots */
.sync-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}
.dot-staged { background: var(--color-primary); }
.dot-warning { background: var(--color-warning); }
.dot-open { background: var(--color-primary); }
.dot-success { background: var(--color-success); }
.dot-error { background: var(--color-error); }

/* Sync item row */
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

/* Filter tabs */
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

.confirm-group {
  margin-top: 8px;
}
</style>
