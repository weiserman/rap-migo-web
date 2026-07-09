<template>
  <div class="page">
    <MenuTop title="Posting Results" :showBack="false" :showHome="true" />
    <div class="page-content">
      <div class="card" style="text-align: center">
        <div style="display: flex; justify-content: center; gap: 32px">
          <div>
            <div style="font-size: 32px; font-weight: 700; color: var(--color-success)">{{ successCount }}</div>
            <div style="font-size: 13px; color: var(--color-text-secondary)">Posted</div>
          </div>
          <div>
            <div style="font-size: 32px; font-weight: 700; color: var(--color-error)">{{ failCount }}</div>
            <div style="font-size: 13px; color: var(--color-text-secondary)">Failed</div>
          </div>
        </div>
      </div>

      <div class="list-group">
        <div v-for="(result, idx) in results" :key="idx" class="result-item" :class="result.success ? 'result-success' : 'result-error'">
          <div class="result-icon">{{ result.success ? '&#10003;' : '&#10007;' }}</div>
          <div>
            <div style="font-weight: 600; font-size: 14px">Item {{ idx + 1 }}</div>
            <div style="font-size: 13px; color: var(--color-text-secondary)">
              {{ result.success ? 'Posted successfully' : result.error || 'Unknown error' }}
            </div>
          </div>
        </div>
      </div>

      <div style="margin-top: 24px; display: flex; gap: 12px">
        <router-link to="/po_list" class="btn btn-primary" style="flex: 1; text-align: center; text-decoration: none">
          Back to PO List
        </router-link>
        <router-link to="/home" class="btn btn-outline" style="flex: 1; text-align: center; text-decoration: none">
          Home
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import MenuTop from '../../components/menutop/index.vue';
import { store } from '../../util/store.js';

const results = computed(() => store.cache.postingResults);
const successCount = computed(() => results.value.filter((r) => r.success).length);
const failCount = computed(() => results.value.filter((r) => !r.success).length);
</script>
