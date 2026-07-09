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
  height: 56px;
  background: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  z-index: 50;
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
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
}
.menutop-title {
  font-size: 18px;
  font-weight: 600;
}
.menutop-right a {
  color: white;
  text-decoration: none;
  font-size: 22px;
  padding: 4px 8px;
}
</style>
