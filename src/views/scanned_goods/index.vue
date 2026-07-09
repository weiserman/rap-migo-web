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

        <!-- Normal state: Post button -->
        <button v-if="!confirmVisible && !posting" class="btn btn-success btn-block" @click="showConfirm">
          Post All Goods Receipts
        </button>

        <!-- Confirmation state: two buttons -->
        <div v-if="confirmVisible && !posting" class="confirm-group">
          <div class="message-strip strip-warning" style="margin-bottom: 12px">
            <span class="message-strip-icon">&#9888;</span>
            <span>Post {{ stagingList.length }} item(s) as goods receipts? This cannot be undone.</span>
          </div>
          <div style="display: flex; gap: 12px">
            <button class="btn btn-outline" style="flex: 1" @click="confirmVisible = false">Cancel</button>
            <button class="btn btn-success" style="flex: 1" @click="doPost">Confirm Post</button>
          </div>
        </div>

        <!-- Posting state: progress -->
        <div v-if="posting" style="text-align: center">
          <button class="btn btn-success btn-block" disabled>Posting...</button>
          <div class="progress-bar">
            <div class="progress-bar-fill" :style="{ width: progressPct + '%' }"></div>
          </div>
          <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px">
            {{ progressPct }}%
          </div>
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
import { EntityService } from '../../util/entities.js';

const router = useRouter();
const posting = ref(false);
const progressPct = ref(0);
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

async function doPost() {
  confirmVisible.value = false;
  posting.value = true;
  progressPct.value = 0;

  try {
    const { results, successCount, failCount } = await EntityService.postGoodsReceipts(
      stagingList.value,
      selectedPO.value,
      (current, total) => {
        progressPct.value = Math.round((current / total) * 100);
      }
    );

    storeActions.setPostingResults(results);
    storeActions.clearStaging();

    // Refresh PO items
    try {
      await EntityService.refreshPoItems(selectedPO.value.PurchaseOrder);
    } catch {
      // Refresh failure is non-fatal
    }

    router.push('/posting_results');
  } catch (err) {
    alert(`Posting failed: ${err.message}`);
  } finally {
    posting.value = false;
  }
}
</script>

<style scoped>
.staged-item {
  cursor: default;
}
</style>
