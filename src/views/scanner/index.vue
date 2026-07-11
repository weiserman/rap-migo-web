<template>
  <div class="page">
    <MenuTop title="Scanner" :showBack="true" />
    <div class="page-content">

      <!-- PO Header -->
      <div class="card po-header-card">
        <div class="po-header-row">
          <div>
            <div class="po-number">PO {{ selectedPO.PurchaseOrder }}</div>
            <div class="po-supplier">{{ selectedPO.SupplierName }}</div>
          </div>
          <div class="po-meta">
            <span class="info-label"><span class="info-label-dot"></span>Plant {{ selectedPO.Plant }}</span>
            <span class="info-label"><span class="info-label-dot"></span>{{ items.length }} item(s)</span>
          </div>
        </div>
      </div>

      <!-- Barcode Input -->
      <div class="card scan-input-card">
        <label class="form-label">Scan Item Barcode</label>
        <div class="search-bar">
          <span class="search-bar-icon">&#128269;</span>
          <input
            ref="barcodeInput"
            class="form-input scan-input"
            v-model="barcode"
            placeholder="Scan or enter barcode..."
            @keyup.enter="handleScan"
            autocomplete="off"
            inputmode="text"
          />
        </div>
        <div v-if="scanError" class="scan-error">{{ scanError }}</div>
        <div v-if="lastScanned" class="scan-success">
          Scanned: {{ lastScanned.Material }} (Item {{ lastScanned.PurchaseOrderItem }})
        </div>
      </div>

      <!-- Active Item Panel (after barcode match) -->
      <div v-if="activeItem" class="card active-item-card">
        <div class="active-item-header">
          <div class="card-title">{{ activeItem.Material }}</div>
          <div class="card-subtitle">{{ activeItem.MaterialDescription }}</div>
        </div>
        <div class="active-item-details">
          <span class="info-label"><span class="info-label-dot"></span>Item {{ activeItem.PurchaseOrderItem }}</span>
          <span class="info-label"><span class="info-label-dot dot-info"></span>Open: {{ activeItem.OpenQuantity }} {{ activeItem.OrderUnit }}</span>
          <span class="info-label"><span class="info-label-dot dot-success"></span>Rcvd: {{ activeItem.ReceivedQuantity }}</span>
          <span v-if="activeItem.StorageLocation" class="info-label"><span class="info-label-dot"></span>SLoc: {{ activeItem.StorageLocation }}</span>
          <span v-if="activeItem.PrimaryEAN" class="info-label"><span class="info-label-dot"></span>EAN: {{ activeItem.PrimaryEAN }}</span>
        </div>

        <div class="form-label" style="text-align: center; font-size: 15px; margin: 12px 0 8px">
          Receipt Quantity ({{ activeItem.OrderUnit }})
        </div>
        <div class="stepper" style="justify-content: center">
          <button class="stepper-btn" @click="adjustQty(-5)">-5</button>
          <button class="stepper-btn" @click="adjustQty(-1)">-1</button>
          <input class="stepper-value" v-model.number="activeQty" type="number" min="0" :max="activeItem.OpenQuantity" />
          <button class="stepper-btn" @click="adjustQty(1)">+1</button>
          <button class="stepper-btn" @click="adjustQty(5)">+5</button>
        </div>
        <div v-if="activeQty > activeItem.OpenQuantity" style="text-align: center; margin-top: 4px">
          <span class="object-status status-warning">Exceeds open quantity</span>
        </div>
        <div class="active-item-actions">
          <button class="btn btn-outline btn-sm" @click="cancelScan">Cancel</button>
          <button class="btn btn-primary btn-sm" @click="stageActive" :disabled="activeQty <= 0" style="flex: 1">
            {{ isAlreadyStaged(activeItem) ? 'Update Staging' : 'Add to Staging' }}
          </button>
        </div>
      </div>

      <!-- Item List -->
      <div v-if="items.length > 0">
        <div class="section-label">ITEMS</div>
        <div class="list-group">
          <div
            v-for="item in items"
            :key="item.id"
            class="list-item item-row"
            :class="{ 'item-active': activeItem && activeItem.id === item.id, 'item-complete': itemStatus[item.id] === 'STAGED' }"
            @click="selectItem(item)"
          >
            <div class="item-status-dot" :class="'dot-' + (itemStatus[item.id] || 'default')"></div>
            <div class="list-item-content">
              <div class="list-item-title">
                {{ item.Material }}
                <span v-if="item.IsCompletelyDelivered" class="object-status status-success">DONE</span>
              </div>
              <div class="list-item-desc">
                Item {{ item.PurchaseOrderItem }} &middot;
                {{ item.MaterialDescription }}
              </div>
              <div class="list-item-desc">
                Open: {{ item.OpenQuantity }} {{ item.OrderUnit }}
                <span v-if="item.PrimaryEAN"> &middot; EAN: {{ item.PrimaryEAN }}</span>
              </div>
              <div v-if="itemStatus[item.id] === 'STAGED'" class="list-item-desc staged-qty">
                Staged: {{ getStagedQty(item) }} {{ item.OrderUnit }}
              </div>
            </div>
            <span class="item-status-label" :class="'label-' + (itemStatus[item.id] || 'default')">
              {{ itemStatusLabel(item.id) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Staged Items -->
      <div v-if="stagingList.length > 0" class="staged-section">
        <div class="section-label staged-section-header" @click="stagedExpanded = !stagedExpanded">
          STAGED ITEMS ({{ stagingList.length }}) {{ stagedExpanded ? '\u25BC' : '\u25B6' }}
        </div>
        <div v-if="stagedExpanded" class="list-group">
          <div v-for="(item, idx) in stagingList" :key="'staged-' + idx" class="list-item staged-item">
            <div class="item-status-dot dot-staged"></div>
            <div class="list-item-content">
              <div class="list-item-title">{{ item.Material }}</div>
              <div class="list-item-desc">
                Item {{ item.PurchaseOrderItem }} &middot;
                Qty: {{ item.recptQty }} {{ item.OrderUnit }}
              </div>
            </div>
            <button class="btn btn-error btn-sm" @click="removeStaged(idx)">Remove</button>
          </div>
        </div>
      </div>

      <!-- Sync Now -->
      <div v-if="totalPending > 0" class="sync-now-section">
        <button class="btn btn-primary btn-block" @click="triggerSync" :disabled="syncRunning">
          {{ syncRunning ? 'Syncing...' :
             stagingList.length > 0 ? 'Queue & Sync ' + totalPending + ' item(s)' :
             'Sync Now (' + totalPending + ')' }}
        </button>
      </div>

      <!-- Empty state -->
      <div v-if="items.length === 0 && !loading" class="empty-state">
        <div>No items found for this PO.</div>
      </div>
      <div v-if="loading" class="loading-overlay">
        <div class="loading-spinner"><div class="spinner"></div>Loading items...</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import MenuTop from '../../components/menutop/index.vue';
import { store, storeActions } from '../../util/store.js';
import { EntityService, matchBarcode, buildGRBody } from '../../util/entities.js';
import {
  enqueue, getPendingCount, getAllItems, initOutbox,
} from '../../util/sync/outbox.js';
import { replayOutbox, onSyncProgress } from '../../util/sync/index.js';
import { addLogEntry } from '../../util/activityLog.js';

const router = useRouter();
const barcodeInput = ref(null);
const barcode = ref('');
const scanError = ref('');
const lastScanned = ref(null);
const loading = ref(false);
const items = ref([]);
const activeItem = ref(null);
const activeQty = ref(0);
const itemStatus = ref({});
const syncRunning = ref(false);
const stagedExpanded = ref(false);
let unsubscribe = null;

const selectedPO = computed(() => store.cache.selectedPO);
const stagingList = computed(() => store.cache.stagingList);
const outboxPending = computed(() => {
  // Will be populated from outbox
  return 0;
});
const totalPending = computed(() => {
  return stagingList.value.length;
});

// ─── Lifecycle ─────────────────────────────────────────

onMounted(async () => {
  if (!selectedPO.value) {
    router.push('/home');
    return;
  }

  loading.value = true;
  try {
    const poNum = selectedPO.value.PurchaseOrder;
    // Use cached items if available, otherwise fetch
    const cached = store.cache.deliveryCache[poNum];
    if (cached && cached.loaded) {
      items.value = cached.items;
    } else {
      items.value = await EntityService.getPoItems(poNum);
    }
    // Initialize item statuses
    buildItemStatus();
  } catch (err) {
    addLogEntry('error', 'Failed to load PO items', err.message);
  } finally {
    loading.value = false;
  }

  // Auto-focus barcode input
  nextTick(() => barcodeInput.value?.focus());

  // Subscribe to sync progress
  unsubscribe = onSyncProgress(() => {
    buildItemStatus();
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});

// Re-focus barcode input when active item is cleared
watch(activeItem, (val) => {
  if (!val) nextTick(() => barcodeInput.value?.focus());
});

// ─── Item Status ───────────────────────────────────────

function buildItemStatus() {
  const status = {};
  // Mark staged items
  for (const s of store.cache.stagingList) {
    const key = `${s.PurchaseOrder}-${s.PurchaseOrderItem}`;
    status[key] = 'STAGED';
  }
  // Mark fully delivered items
  for (const item of items.value) {
    if (item.IsCompletelyDelivered && !status[item.id]) {
      status[item.id] = 'COMPLETE';
    }
  }
  itemStatus.value = status;
}

function itemStatusLabel(id) {
  switch (itemStatus.value[id]) {
    case 'STAGED': return 'Staged';
    case 'COMPLETE': return 'Done';
    case 'SCANNED': return 'Scanned';
    default: return '';
  }
}

function isAlreadyStaged(item) {
  return store.cache.stagingList.some(
    (s) => s.PurchaseOrder === item.PurchaseOrder && s.PurchaseOrderItem === item.PurchaseOrderItem
  );
}

function getStagedQty(item) {
  const staged = store.cache.stagingList.find(
    (s) => s.PurchaseOrder === item.PurchaseOrder && s.PurchaseOrderItem === item.PurchaseOrderItem
  );
  return staged ? staged.recptQty : 0;
}

// ─── Barcode Scanning ──────────────────────────────────

function handleScan() {
  const code = barcode.value.trim();
  if (!code) return;

  scanError.value = '';
  lastScanned.value = null;

  const match = matchBarcode(code, items.value);
  if (!match) {
    scanError.value = `No match for barcode "${code}"`;
    addLogEntry('warning', `Unmatched barcode: ${code}`);
    barcode.value = '';
    return;
  }

  const { item } = match;

  if (item.IsCompletelyDelivered) {
    scanError.value = `${item.Material} is fully delivered`;
    barcode.value = '';
    return;
  }

  // Set active item and pre-fill qty
  activeItem.value = item;
  activeQty.value = Math.floor(item.OpenQuantity);
  lastScanned.value = item;
  itemStatus.value = { ...itemStatus.value, [item.id]: 'SCANNED' };
  barcode.value = '';

  addLogEntry('info', `Scanned: ${item.Material}`, `Item ${item.PurchaseOrderItem}, EAN matched`);
}

function selectItem(item) {
  if (item.IsCompletelyDelivered) return;
  activeItem.value = item;
  activeQty.value = Math.floor(item.OpenQuantity);
}

function adjustQty(delta) {
  activeQty.value = Math.max(0, (activeQty.value || 0) + delta);
}

function cancelScan() {
  activeItem.value = null;
  activeQty.value = 0;
  scanError.value = '';
}

function stageActive() {
  if (!activeItem.value || activeQty.value <= 0) return;

  storeActions.addToStaging({
    ...activeItem.value,
    recptQty: activeQty.value,
    postingDate: '',
  });

  addLogEntry('success', `Staged: ${activeItem.value.Material}`,
    `Qty ${activeQty.value} ${activeItem.value.OrderUnit}`);

  activeItem.value = null;
  activeQty.value = 0;
  buildItemStatus();
}

function removeStaged(idx) {
  const item = stagingList.value[idx];
  storeActions.removeFromStaging(item.PurchaseOrder, item.PurchaseOrderItem);
  addLogEntry('info', `Removed from staging: ${item.Material}`);
  buildItemStatus();
}

// ─── Sync ──────────────────────────────────────────────

async function triggerSync() {
  if (syncRunning.value) return;
  syncRunning.value = true;

  try {
    // Phase 1: Enqueue staged items
    if (stagingList.value.length > 0 && selectedPO.value) {
      const poHeader = selectedPO.value;
      const stagedItems = [...stagingList.value];
      const operatorId = store.user.name || 'unknown';

      addLogEntry('info', `Queueing ${stagedItems.length} staged item(s)`, `PO ${poHeader.PurchaseOrder}`);

      for (const item of stagedItems) {
        const payload = buildGRBody(item, poHeader);
        await enqueue({
          id: payload.PostingID,
          operator_id: operatorId,
          po_number: poHeader.PurchaseOrder,
          payload,
        });
      }

      storeActions.clearStaging();
      addLogEntry('success', `Queued ${stagedItems.length} item(s) to outbox`);
      buildItemStatus();

      try {
        await EntityService.refreshPoItems(poHeader.PurchaseOrder);
      } catch { /* non-fatal */ }
    }

    // Phase 2: Trigger replay
    await initOutbox();
    const count = await getPendingCount();
    store.sync.pendingCount = count;

    if (count > 0) {
      addLogEntry('info', 'Starting sync...', `${count} pending item(s)`);
      await replayOutbox();
    } else {
      addLogEntry('info', 'No pending items to sync');
    }
  } catch (err) {
    addLogEntry('error', `Sync failed: ${err.message}`);
  } finally {
    syncRunning.value = false;
  }
}
</script>

<style scoped>
.po-header-card {
  border-left: 3px solid var(--color-primary);
}
.po-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.po-number {
  font-size: 16px;
  font-weight: 700;
}
.po-supplier {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}
.po-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-end;
}

.scan-input-card {
  border-left: 3px solid var(--color-warning);
}
.scan-input {
  font-size: 16px;
  font-weight: 600;
}
.scan-error {
  font-size: 12px;
  color: var(--color-error);
  margin-top: 6px;
}
.scan-success {
  font-size: 12px;
  color: var(--color-success);
  margin-top: 6px;
}

.active-item-card {
  border-left: 3px solid var(--color-primary);
  background: var(--fiori-blue-light);
}
.active-item-header {
  margin-bottom: 8px;
}
.active-item-details {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}
.active-item-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.8px;
  padding: 0 4px 8px;
}

.item-row {
  gap: 10px;
  cursor: pointer;
}
.item-active {
  background: var(--fiori-blue-light);
}
.item-complete {
  opacity: 0.6;
}
.item-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}
.item-status-dot.dot-default { background: var(--color-border); }
.item-status-dot.dot-SCANNED, .dot-staged { background: var(--color-primary); }
.item-status-dot.dot-STAGED { background: var(--color-success); }
.item-status-dot.dot-COMPLETE { background: var(--color-success); }

.item-status-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 4px;
  margin-top: 2px;
}
.label-default { display: none; }
.label-SCANNED { color: var(--color-primary); background: var(--fiori-blue-light); }
.label-STAGED { color: var(--color-success); background: var(--fiori-green-light); }
.label-COMPLETE { color: var(--color-success); background: var(--fiori-green-light); }

.staged-qty {
  color: var(--color-success);
  font-weight: 600;
}

.staged-section {
  margin-top: 16px;
}
.staged-section-header {
  cursor: pointer;
  user-select: none;
}
.staged-item {
  gap: 10px;
}

.sync-now-section {
  margin-top: 16px;
}
</style>
