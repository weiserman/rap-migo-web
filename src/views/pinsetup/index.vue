<template>
  <div class="page">
    <div class="page-content" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh">
      <PinMobile title="Create New PIN" @submit="handleSetupPin" />
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { storeActions } from '../../util/store.js';
import PinMobile from '../../components/pinmobile/PinMobile.vue';

const router = useRouter();

const handleSetupPin = (chosenPin) => {
  storeActions.saveNewPin(chosenPin);
  storeActions.login();
  router.push('/home');
};
</script>
