<template>
  <div class="page">
    <MenuTop title="Staged Items" :showBack="true" />
    <div class="page-content">
      <div v-if="stagingList.length === 0" class="empty-state">
        <div class="empty-state-icon">&#128230;</div>
        <div>No items staged yet. Go back and add items.</div>
      </div>

      <div class="list-group">
        <div v-for="(item, idx) in stagingList" :key="idx" class="list-item staged-item">
          <div class="list-item-content">
            <div class="list-item-title">{{ item.Material }}</div>
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

      <div v-if="stagingList.length > 0" style="margin-top: 16px">
        <div class="card" style="text-align: center">
          <div class="object-status status-open" style="font-size: 14px; margin-bottom: 4px">
            {{ stagingList.length }} item(s) ready to post
          </div>
          <div style="font-size: 12px; color: var(--color-text-secondary)">
            PO {{ selectedPO?.PurchaseOrder || '' }} &middot; Plant {{ selectedPO?.Plant || '' }}
          </div>
        </div>

        <!-- Normal state: Stage button -->
        <button v-if="!confirmVisible && !staging" class="btn btn-success btn-block" @click="showConfirm">
          Stage for Posting
        </button>

        <!-- Confirmation state: two buttons -->
        <div v-if="confirmVisible && !staging" class="confirm-group">
          <div class="message-strip strip-warning" style="margin-bottom: 12px">
            <span class="message-strip-icon">&#9888;</span>
            <span>Stage {{ stagingList.length }} item(s) for posting? Items will be queued and posted in the background.</span>
          </div>
          <div style="display: flex; gap: 12px">
            <button class="btn btn-outline" style="flex: 1" @click="confirmVisible = false">Cancel</button>
            <button class="btn btn-success" style="flex: 1" @click="doPost">Confirm Stage</button>
          </div>
        </div>

        <!-- Staging state: progress -->
        <div v-if="staging" style="text-align: center">
          <button class="btn btn-success btn-block" disabled>Staging...</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import MenuTop from '../../components/menutop/index.vue';
import { store, storeActions } from '../../util/store.js';
import { buildGRBody } from '../../util/entities.js';
import { enqueue, getPendingCount } from '../../util/sync/outbox.js';
import { replayOutbox, isSyncing } from '../../util/sync/engine.js';

const router = useRouter();
const staging = ref(false);
const confirmVisible = ref(false);

const stagingList = computed(() => store.cache.stagingList);
const selectedPO = computed(() => store.cache.selectedPO);

function removeItem(idx) {
  const item = stagingList.value[idx];
  storeActions.removeFromStaging(item.PurchaseOrder, item.PurchaseOrderItem);
}

function showConfirm() {
  if (!selectedPO.value || stagingList.value.length === 0) return;
  confirmVisible.value = true;
}

/**
 * Phase A (capture): Enqueue each staging item to the durable outbox.
 * The PostingID in the payload is the outbox item's id — the idempotency key.
 * After enqueue, trigger the sync engine to start replaying.
 */
async function doPost() {
  confirmVisible.value = false;
  staging.value = true;

  try {
    const poHeader = selectedPO.value;
    const items = stagingList.value;
    const operatorId = store.user.name || 'unknown';

    // Enqueue each item to the durable outbox
    for (const item of items) {
      const payload = buildGRBody(item, poHeader);
      await enqueue({
        id: payload.PostingID,     // UUID = idempotency key
        operator_id: operatorId,
        po_number: poHeader.PurchaseOrder,
        payload: payload,          // Full GR body (includes PostingID)
      });
    }

    // Clear staging list — items are now safely persisted in outbox
    storeActions.clearStaging();

    // Update pending count in store
    const pendingCount = await getPendingCount();
    store.sync.pendingCount = pendingCount;

    // Store the posting results for the results page
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

    // Refresh PO items
    try {
      const { EntityService } = await import('../../util/entities.js');
      await EntityService.refreshPoItems(poHeader.PurchaseOrder);
    } catch {
      // Refresh failure is non-fatal
    }

    // Navigate to results
    router.push('/posting_results');

    // Phase B: Trigger sync engine replay (runs in background)
    if (!isSyncing()) {
      replayOutbox();
    }
  } catch (err) {
    alert(`Failed to stage items: ${err.message}`);
  } finally {
    staging.value = false;
  }
}
</script>

<style scoped>
.staged-item {
  cursor: default;
}
</style>
