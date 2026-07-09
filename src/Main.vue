<template>
  <div class="minimal-container">
    <router-view></router-view>
  </div>
  <CustomDialog />
</template>

<script setup>
import { onMounted } from 'vue';
import CustomDialog from './components/dialog/CustomDialog.vue';
import { initWindowOverrides } from './components/dialog/useDialog.js';

onMounted(() => {
  initWindowOverrides();
});
</script>
