<template>
  <div class="menutop">
    <div class="menutop-left">
      <button v-if="showBack" class="menutop-back" @click="$router.back()">&larr;</button>
      <span class="menutop-title">{{ title }}</span>
    </div>
    <div class="menutop-right">
      <router-link v-if="showHome" to="/home" class="menutop-home">&#8962;</router-link>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: 'MIGO GR' },
  showBack: { type: Boolean, default: false },
  showHome: { type: Boolean, default: true },
});
</script>

<style scoped>
.menutop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  background: var(--fiori-shell-header);
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 50;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.menutop-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.menutop-back {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  opacity: 0.9;
}
.menutop-back:active {
  opacity: 1;
}
.menutop-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.2px;
}
.menutop-right a {
  color: white;
  text-decoration: none;
  font-size: 20px;
  padding: 4px 8px;
  opacity: 0.85;
}
.menutop-right a:active {
  opacity: 1;
}
</style>
