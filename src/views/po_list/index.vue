<template>
  <div class="page">
    <MenuTop title="Purchase Orders" :showBack="true" />
    <div class="page-content">
      <div v-if="loading" class="loading-overlay">
        <div class="loading-spinner"><div class="spinner"></div>Loading POs...</div>
      </div>

      <div class="search-bar">
        <span class="search-bar-icon">&#128269;</span>
        <input
          class="form-input"
          v-model="searchText"
          placeholder="Filter by PO number or supplier"
          autocomplete="off"
        />
      </div>

      <div v-if="!loading && filteredList.length === 0" class="empty-state">
        <div class="empty-state-icon">&#128230;</div>
        <div v-if="searchText">No matching purchase orders</div>
        <div v-else>No purchase orders found for plant {{ store.plant }}</div>
      </div>

      <div v-if="filteredList.length > 0" class="list-group">
        <div v-for="po in filteredList" :key="po.PurchaseOrder" class="list-item" @click="selectPO(po)">
          <div class="list-item-content">
            <div class="list-item-title">{{ po.PurchaseOrder }}</div>
            <div class="list-item-desc">{{ po.SupplierName }}</div>
            <div class="list-item-desc">
              {{ po.PurchaseOrderDate }} &middot; {{ po.ItemCount }} item(s) &middot; {{ po.OpenItemCount }} open
            </div>
          </div>
          <span class="object-status status-open">{{ po.OpenItemCount }}</span>
          <span class="nav-arrow">&#8250;</span>
        </div>
      </div>

      <button class="btn btn-outline btn-block" style="margin-top: 16px" @click="loadPOs">
        Refresh
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import MenuTop from '../../components/menutop/index.vue';
import { store, storeActions } from '../../util/store.js';
import { EntityService } from '../../util/entities.js';

const router = useRouter();
const loading = ref(false);
const searchText = ref('');
const poList = ref([]);

const filteredList = computed(() => {
  const q = searchText.value.trim().toLowerCase();
  if (!q) return poList.value;
  return poList.value.filter(
    (po) =>
      po.PurchaseOrder.toLowerCase().includes(q) ||
      po.SupplierName.toLowerCase().includes(q)
  );
});

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
  router.push('/scanner');
}
</script>

<style scoped>
.nav-arrow {
  color: var(--color-text-secondary);
  font-size: 20px;
  font-weight: 300;
  margin-left: 8px;
}
</style>
