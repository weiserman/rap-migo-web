<template>
  <div class="page">
    <MenuTop title="Find Purchase Order" :showBack="true" />
    <div class="page-content">
      <div class="card">
        <div class="form-group" style="margin-bottom: 8px">
          <label class="form-label">Purchase Order Number</label>
          <div class="search-bar">
            <span class="search-bar-icon">&#128269;</span>
            <input
              ref="poInput"
              class="form-input"
              v-model="poNumber"
              placeholder="Enter or scan PO number"
              @keyup.enter="lookupPO"
              autocomplete="off"
              inputmode="text"
            />
          </div>
        </div>
        <button class="btn btn-primary btn-block" @click="lookupPO" :disabled="loading || !poNumber.trim()">
          {{ loading ? 'Searching...' : 'Find PO' }}
        </button>
      </div>

      <div v-if="error" class="message-strip strip-error">
        <span class="message-strip-icon">&#10007;</span>
        <span>{{ error }}</span>
      </div>

      <div v-if="poHistory.length > 0">
        <div class="section-label">RECENT</div>
        <div class="list-group">
          <div
            v-for="po in poHistory"
            :key="po.PurchaseOrder"
            class="list-item"
            @click="openFromHistory(po)"
          >
            <div class="list-item-content">
              <div class="list-item-title">{{ po.PurchaseOrder }}</div>
              <div class="list-item-desc">{{ po.SupplierName }} &middot; Plant {{ po.Plant }}</div>
            </div>
            <span class="nav-arrow">&#8250;</span>
          </div>
        </div>

        <button
          class="btn btn-outline btn-sm"
          style="margin-top: 8px"
          @click="storeActions.clearPoHistory()"
        >
          Clear History
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import MenuTop from '../../components/menutop/index.vue';
import { store, storeActions } from '../../util/store.js';
import { EntityService } from '../../util/entities.js';

const router = useRouter();
const poInput = ref(null);
const poNumber = ref('');
const loading = ref(false);
const error = ref('');
const poHistory = computed(() => store.cache.poHistory || []);

onMounted(() => {
  nextTick(() => poInput.value?.focus());
});

async function lookupPO() {
  const num = poNumber.value.trim();
  if (!num) return;

  loading.value = true;
  error.value = '';

  try {
    const po = await EntityService.getPoHeader(num);
    if (!po) {
      error.value = `PO ${num} not found.`;
      return;
    }

    storeActions.setSelectedPO(po);
    router.push({ name: 'po_items', params: { poNumber: po.PurchaseOrder } });
  } catch (err) {
    error.value = err.message || 'Failed to look up PO.';
  } finally {
    loading.value = false;
  }
}

function openFromHistory(po) {
  poNumber.value = po.PurchaseOrder;
  lookupPO();
}
</script>

<style scoped>
.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.8px;
  padding: 0 4px 8px;
  margin-top: 16px;
}
.nav-arrow {
  color: var(--color-text-secondary);
  font-size: 20px;
  font-weight: 300;
  margin-left: 8px;
}
</style>
