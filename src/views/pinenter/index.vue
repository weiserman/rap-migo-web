<template>
  <div class="page">
    <div class="page-content" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh">
      <PinMobile
        ref="pinEntryRef"
        title="Enter PIN to Unlock"
        :errorMessage="errorMessage"
        @submit="handleVerifyPin"
      />

      <div class="forgot-container">
        <button class="forgot-btn" @click="handleForgotPin">Forgot PIN?</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { store, storeActions } from '../../util/store.js';
import PinMobile from '../../components/pinmobile/PinMobile.vue';

const router = useRouter();
const pinEntryRef = ref(null);
const errorMessage = ref('');

const handleVerifyPin = (enteredPin) => {
  if (String(enteredPin) === String(store.appPin)) {
    errorMessage.value = '';
    storeActions.login();
    router.push('/home');
  } else {
    errorMessage.value = 'Incorrect PIN code.';
    if (pinEntryRef.value) {
      pinEntryRef.value.clearAll();
    }
  }
};

const handleForgotPin = () => {
  const confirmReset = confirm(
    'Are you sure you want to reset your PIN? This will clear all saved settings.'
  );
  if (confirmReset) {
    storeActions.resetStore();
    router.push('/setup');
  }
};
</script>

<style scoped>
.forgot-container {
  margin-top: 20px;
  text-align: center;
}
.forgot-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  text-decoration: underline;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 5px 10px;
}
.forgot-btn:active {
  color: var(--color-text);
}
</style>
