<template>
  <div class="page">
    <MenuTop title="Receipt Quantity" :showBack="true" />
    <div class="page-content" v-if="item">
      <div class="card">
        <div class="card-title">{{ item.Material }}</div>
        <div class="card-subtitle">{{ item.MaterialDescription }}</div>
        <div style="margin-top: 12px; font-size: 13px; color: var(--color-text-secondary)">
          <div>Item: {{ item.PurchaseOrderItem }}</div>
          <div>Order Qty: {{ item.OrderQuantity }} {{ item.OrderUnit }}</div>
          <div>Open Qty: {{ item.OpenQuantity }} {{ item.OrderUnit }}</div>
          <div>Received: {{ item.ReceivedQuantity }} {{ item.OrderUnit }}</div>
          <div v-if="item.StorageLocation">Storage: {{ item.StorageLocation }}</div>
          <div v-if="item.PrimaryEAN">EAN: {{ item.PrimaryEAN }}</div>
        </div>
      </div>

      <div class="card">
        <div class="form-label" style="text-align: center; font-size: 15px; margin-bottom: 8px">
          Receipt Quantity
        </div>
        <div class="stepper" style="justify-content: center">
          <button class="stepper-btn" @click="adjustQty(-1)">-</button>
          <input class="stepper-value" v-model.number="recptQty" type="number" min="0" :max="item.OpenQuantity" />
          <button class="stepper-btn" @click="adjustQty(1)">+</button>
        </div>
        <div style="text-align: center; margin-top: 8px; font-size: 13px; color: var(--color-text-secondary)">
          Unit: {{ item.OrderUnit }}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Posting Date (optional)</label>
        <input class="form-input" v-model="postingDate" type="date" />
      </div>

      <button
        class="btn btn-primary btn-block"
        :disabled="recptQty <= 0"
        @click="addToStaging"
      >
        Add to Staging
      </button>

      <div v-if="recptQty > item.OpenQuantity" style="margin-top: 8px; text-align: center">
        <span class="list-item-badge badge-pending">Exceeds open quantity</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import MenuTop from '../../components/menutop/index.vue';
import { store, storeActions } from '../../util/store.js';

const router = useRouter();

const item = computed(() => store.cache.currentItem);
const recptQty = ref(item.value ? Math.floor(item.value.OpenQuantity) : 0);
const postingDate = ref('');

function adjustQty(delta) {
  const newVal = (recptQty.value || 0) + delta;
  recptQty.value = Math.max(0, newVal);
}

function addToStaging() {
  if (!item.value || recptQty.value <= 0) return;

  storeActions.addToStaging({
    ...item.value,
    recptQty: recptQty.value,
    postingDate: postingDate.value || '',
  });

  router.back();
}
</script>
