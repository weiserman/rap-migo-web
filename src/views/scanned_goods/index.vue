<template>
  <div class="page">
    <MenuTop title="Staged Items" :showBack="true" />
    <div class="page-content">
      <div v-if="stagingList.length === 0" class="empty-state">
        <div class="empty-state-icon">&#128230;</div>
        <div>No items staged yet. Go back and add items.</div>
      </div>

      <div v-for="(item, idx) in stagingList" :key="idx" class="card">
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div>
            <div class="card-title">{{ item.Material }}</div>
            <div class="card-subtitle">
              Item {{ item.PurchaseOrderItem }} &middot;
              Qty: {{ item.recptQty }} {{ item.OrderUnit }}
            </div>
          </div>
          <button class="btn btn-error btn-sm" @click="removeItem(idx)">Remove</button>
        </div>
      </div>

      <div v-if="stagingList.length > 0" style="margin-top: 16px">
        <div class="card" style="text-align: center">
          <div style="font-size: 24px; font-weight: 700">{{ stagingList.length }}</div>
          <div style="font-size: 13px; color: var(--color-text-secondary)">items to post</div>
        </div>

        <button class="btn btn-success btn-block" @click="postAll" :disabled="posting">
          {{ posting ? 'Posting...' : 'Post All Goods Receipts' }}
        </button>

        <div v-if="posting" class="progress-bar">
          <div class="progress-bar-fill" :style="{ width: progressPct + '%' }"></div>
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

const stagingList = computed(() => store.cache.stagingList);
const selectedPO = computed(() => store.cache.selectedPO);

function removeItem(idx) {
  const item = stagingList.value[idx];
  storeActions.removeFromStaging(item.PurchaseOrder, item.PurchaseOrderItem);
}

async function postAll() {
  if (!selectedPO.value || stagingList.value.length === 0) return;

  const confirmed = await confirm(
    `Post ${stagingList.value.length} item(s) as goods receipts?\n\nThis action cannot be undone.`
  );
  if (!confirmed) return;

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
