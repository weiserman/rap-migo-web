<template>
  <div class="page">
    <MenuTop title="MIGO GR Scanner" :showBack="false" :showHome="false" />
    <div class="page-content">
      <div class="object-header">
        <div class="object-header-title">Goods Receipt Scanner</div>
        <div class="object-header-subtitle">Plant {{ store.plant }}</div>
        <div class="object-header-attrs">
          <span class="info-label">
            <span class="info-label-dot dot-info"></span>
            {{ store.config.baseHost }}
          </span>
        </div>
      </div>

      <div v-if="stagingCount > 0" class="message-strip strip-info">
        <span class="message-strip-icon">&#9432;</span>
        <span>{{ stagingCount }} item(s) staged for posting</span>
      </div>

      <div class="section-label">ACTIONS</div>
      <div class="list-group">
        <router-link to="/po_lookup" class="list-item">
          <div class="list-item-content">
            <div class="list-item-title">Scan / Enter PO</div>
            <div class="list-item-desc">Look up a purchase order by number</div>
          </div>
          <span class="nav-arrow">&#8250;</span>
        </router-link>

        <router-link to="/po_list" class="list-item">
          <div class="list-item-content">
            <div class="list-item-title">Browse PO List</div>
            <div class="list-item-desc">View open purchase orders for this plant</div>
          </div>
          <span class="nav-arrow">&#8250;</span>
        </router-link>

        <router-link v-if="stagingCount > 0" to="/scanned_goods" class="list-item">
          <div class="list-item-content">
            <div class="list-item-title">Review Staged Items</div>
            <div class="list-item-desc">{{ stagingCount }} item(s) ready to post</div>
          </div>
          <span class="object-status status-open">{{ stagingCount }}</span>
          <span class="nav-arrow">&#8250;</span>
        </router-link>

        <router-link to="/config" class="list-item">
          <div class="list-item-content">
            <div class="list-item-title">Configuration</div>
            <div class="list-item-desc">Server, credentials, plant settings</div>
          </div>
          <span class="nav-arrow">&#8250;</span>
        </router-link>

        <div class="list-item" @click="lockApp">
          <div class="list-item-content">
            <div class="list-item-title">Lock App</div>
            <div class="list-item-desc">Require PIN to re-enter</div>
          </div>
          <span class="nav-arrow">&#8250;</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import MenuTop from '../../components/menutop/index.vue';
import { store, storeActions } from '../../util/store.js';
import { useRouter } from 'vue-router';

const router = useRouter();
const stagingCount = computed(() => store.cache.stagingList.length);

function lockApp() {
  storeActions.logout();
  router.push('/enter');
}
</script>

<style scoped>
.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.8px;
  padding: 0 4px 8px;
}
.nav-arrow {
  color: var(--color-text-secondary);
  font-size: 20px;
  font-weight: 300;
  margin-left: 8px;
}
</style>
