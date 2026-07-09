<template>
  <div class="page">
    <MenuTop :title="`PO ${poNumber}`" :showBack="true" />
    <div class="page-content">
      <div v-if="loading" class="loading-overlay">
        <div class="loading-spinner"><div class="spinner"></div>Loading items...</div>
      </div>

      <div v-if="!loading && items.length === 0" class="empty-state">
        <div class="empty-state-icon">&#128230;</div>
        <div>No items found</div>
      </div>

      <div v-for="item in items" :key="item.id" class="card" @click="openReceipt(item)">
        <div style="display: flex; justify-content: space-between; align-items: start">
          <div>
            <div class="card-title">{{ item.Material }}</div>
            <div class="card-subtitle">{{ item.MaterialDescription }}</div>
          </div>
          <span
            v-if="item.IsCompletelyDelivered"
            class="list-item-badge badge-complete"
            style="font-size: 11px"
          >DONE</span>
        </div>
        <div style="display: flex; gap: 16px; margin-top: 8px; font-size: 13px; color: var(--color-text-secondary)">
          <span>Item: {{ item.PurchaseOrderItem }}</span>
          <span>Open: {{ item.OpenQuantity }} {{ item.OrderUnit }}</span>
          <span>Rcvd: {{ item.ReceivedQuantity }}</span>
        </div>
        <div v-if="item.PrimaryEAN" style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px">
          EAN: {{ item.PrimaryEAN }}
        </div>
      </div>

      <div v-if="store.cache.stagingList.length > 0" style="margin-top: 16px">
        <button class="btn btn-success btn-block" @click="$router.push('/scanned_goods')">
          Review {{ store.cache.stagingList.length }} staged item(s)
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import MenuTop from '../../components/menutop/index.vue';
import { store, storeActions } from '../../util/store.js';
import { EntityService } from '../../util/entities.js';

const props = defineProps({ poNumber: String });
const router = useRouter();
const loading = ref(false);
const items = ref([]);

onMounted(async () => {
  loading.value = true;
  try {
    items.value = await EntityService.getPoItems(props.poNumber);
  } catch (err) {
    alert(`Failed to load items: ${err.message}`);
  } finally {
    loading.value = false;
  }
});

function openReceipt(item) {
  if (item.IsCompletelyDelivered) {
    alert('This item is completely delivered.');
    return;
  }
  store.cache.currentItem = item;
  router.push({ name: 'receipt_item', params: { itemId: item.id } });
}
</script>
