<template>
  <div class="page">
    <MenuTop title="Purchase Orders" :showBack="true" />
    <div class="page-content">
      <div v-if="loading" class="loading-overlay">
        <div class="loading-spinner"><div class="spinner"></div>Loading POs...</div>
      </div>

      <div v-if="!loading && poList.length === 0" class="empty-state">
        <div class="empty-state-icon">&#128230;</div>
        <div>No purchase orders found for plant {{ store.plant }}</div>
      </div>

      <div class="list-group">
        <div v-for="po in poList" :key="po.PurchaseOrder" class="list-item" @click="selectPO(po)">
          <div class="list-item-content">
            <div class="list-item-title">{{ po.PurchaseOrder }}</div>
            <div class="list-item-desc">{{ po.SupplierName }}</div>
            <div class="list-item-desc">
              {{ po.PurchaseOrderDate }} · {{ po.ItemCount }} item(s) · {{ po.OpenItemCount }} open
            </div>
          </div>
          <span class="list-item-badge badge-open">{{ po.OpenItemCount }}</span>
        </div>
      </div>

      <button class="btn btn-outline btn-block" style="margin-top: 16px" @click="loadPOs">
        Refresh
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import MenuTop from '../../components/menutop/index.vue';
import { store, storeActions } from '../../util/store.js';
import { EntityService } from '../../util/entities.js';

const router = useRouter();
const loading = ref(false);
const poList = ref([]);

onMounted(() => loadPOs());

async function loadPOs() {
  loading.value = true;
  try {
    const result = await EntityService.getDeliveriesList(store.plant);
    poList.value = result.items;
  } catch (err) {
    alert(`Failed to load POs: ${err.message}`);
  } finally {
    loading.value = false;
  }
}

function selectPO(po) {
  storeActions.setSelectedPO(po);
  router.push({ name: 'po_items', params: { poNumber: po.PurchaseOrder } });
}
</script>
