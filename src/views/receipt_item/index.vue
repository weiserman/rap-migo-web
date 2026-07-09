<template>
  <div class="page">
    <MenuTop title="Receipt Quantity" :showBack="true" />
    <div class="page-content" v-if="item">
      <div class="object-header">
        <div class="object-header-title">{{ item.Material }}</div>
        <div class="object-header-subtitle">{{ item.MaterialDescription }}</div>
        <div class="object-header-attrs">
          <span class="info-label">
            <span class="info-label-dot"></span>
            Item {{ item.PurchaseOrderItem }}
          </span>
          <span v-if="item.StorageLocation" class="info-label">
            <span class="info-label-dot"></span>
            SLoc {{ item.StorageLocation }}
          </span>
          <span v-if="item.PrimaryEAN" class="info-label">
            <span class="info-label-dot"></span>
            EAN {{ item.PrimaryEAN }}
          </span>
        </div>
      </div>

      <div class="card">
        <div style="display: flex; justify-content: space-around; margin-bottom: 12px">
          <div style="text-align: center">
            <span class="object-status status-open">Open: {{ item.OpenQuantity }}</span>
          </div>
          <div style="text-align: center">
            <span class="object-status status-success">Rcvd: {{ item.ReceivedQuantity }}</span>
          </div>
        </div>

        <div class="form-label" style="text-align: center; font-size: 15px; margin-bottom: 8px">
          Receipt Quantity ({{ item.OrderUnit }})
        </div>
        <div class="stepper" style="justify-content: center">
          <button class="stepper-btn" @click="adjustQty(-5)">-5</button>
          <button class="stepper-btn" @click="adjustQty(-1)">-1</button>
          <input class="stepper-value" v-model.number="recptQty" type="number" min="0" :max="item.OpenQuantity" />
          <button class="stepper-btn" @click="adjustQty(1)">+1</button>
          <button class="stepper-btn" @click="adjustQty(5)">+5</button>
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
        <span class="object-status status-warning">Exceeds open quantity</span>
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
