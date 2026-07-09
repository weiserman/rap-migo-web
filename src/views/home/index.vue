<template>
  <div class="page">
    <MenuTop title="MIGO GR Scanner" :showBack="false" :showHome="false" />
    <div class="page-content">
      <div class="card app-header-card">
        <div class="card-title">Goods Receipt Scanner</div>
        <div class="card-subtitle">Plant: {{ store.plant }} · {{ store.config.baseHost }}</div>
      </div>

      <div class="section-label">ACTIONS</div>
      <div class="list-group">
        <router-link to="/po_list" class="list-item">
          <div class="list-item-content">
            <div class="list-item-title">Receive Goods</div>
            <div class="list-item-desc">Browse POs and post goods receipts</div>
          </div>
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
import MenuTop from '../../components/menutop/index.vue';
import { store, storeActions } from '../../util/store.js';
import { useRouter } from 'vue-router';

const router = useRouter();

function lockApp() {
  storeActions.logout();
  router.push('/enter');
}
</script>

<style scoped>
.app-header-card {
  margin-bottom: 24px;
}
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
