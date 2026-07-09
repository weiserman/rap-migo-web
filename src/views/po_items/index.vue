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

      <div v-for="item in items" :key="item.id" class="card item-card">
        <div class="item-card-header">
          <div>
            <div class="card-title">{{ item.Material }}</div>
            <div class="card-subtitle">{{ item.MaterialDescription }}</div>
          </div>
          <span
            v-if="item.IsCompletelyDelivered"
            class="object-status status-success"
          >DONE</span>
        </div>

        <div class="item-card-details">
          <span class="info-label">
            <span class="info-label-dot"></span>
            Item {{ item.PurchaseOrderItem }}
          </span>
          <span class="info-label">
            <span class="info-label-dot dot-info"></span>
            Open: {{ item.OpenQuantity }} {{ item.OrderUnit }}
          </span>
          <span class="info-label">
            <span class="info-label-dot dot-success"></span>
            Rcvd: {{ item.ReceivedQuantity }}
          </span>
          <span v-if="item.StorageLocation" class="info-label">
            <span class="info-label-dot"></span>
            SLoc: {{ item.StorageLocation }}
          </span>
          <span v-if="item.PrimaryEAN" class="info-label">
            <span class="info-label-dot"></span>
            EAN: {{ item.PrimaryEAN }}
          </span>
        </div>

        <div v-if="!item.IsCompletelyDelivered" class="item-card-stepper">
          <div class="stepper">
            <button class="stepper-btn" @click="adjustQty(item, -5)">-5</button>
            <button class="stepper-btn" @click="adjustQty(item, -1)">-1</button>
            <input class="stepper-value" v-model.number="item.recptQty" type="number" min="0" />
            <button class="stepper-btn" @click="adjustQty(item, 1)">+1</button>
            <button class="stepper-btn" @click="adjustQty(item, 5)">+5</button>
          </div>
          <button
            class="btn btn-primary btn-sm"
            style="margin-top: 8px; width: 100%"
            :disabled="item.recptQty <= 0"
            @click="stageItem(item)"
          >
            {{ isStaged(item) ? 'Update Staging' : 'Add to Staging' }}
          </button>
        </div>
      </div>

      <router-link
        v-if="store.cache.stagingList.length > 0"
        to="/scanned_goods"
        class="floating-badge"
      >
        &#128230; Review {{ store.cache.stagingList.length }} staged item(s)
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import MenuTop from '../../components/menutop/index.vue';
import { store, storeActions } from '../../util/store.js';
import { EntityService } from '../../util/entities.js';

const props = defineProps({ poNumber: String });
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

function adjustQty(item, delta) {
  item.recptQty = Math.max(0, (item.recptQty || 0) + delta);
}

function isStaged(item) {
  return store.cache.stagingList.some(
    (s) =>
      s.PurchaseOrder === item.PurchaseOrder &&
      s.PurchaseOrderItem === item.PurchaseOrderItem
  );
}

function stageItem(item) {
  if (!item.recptQty || item.recptQty <= 0) return;
  storeActions.addToStaging({ ...item });
}
</script>

<style scoped>
.item-card {
  padding: 14px;
}
.item-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.item-card-details {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 10px 0;
}
.item-card-stepper {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}
</style>
