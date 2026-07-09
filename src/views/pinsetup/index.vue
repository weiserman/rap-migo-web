<template>
  <div class="page">
    <div class="page-content" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh">
      <h2 style="margin-bottom: 24px; text-align: center">Set Your PIN</h2>
      <p style="text-align: center; color: var(--color-text-secondary); margin-bottom: 24px">
        Choose a 4-digit PIN to secure the app
      </p>
      <input
        ref="pinInput"
        class="form-input"
        style="width: 120px; text-align: center; font-size: 24px; letter-spacing: 8px"
        type="password"
        maxlength="4"
        inputmode="numeric"
        pattern="[0-9]*"
        v-model="pin"
        @input="onInput"
      />
      <div v-if="error" style="color: var(--color-error); margin-top: 8px; font-size: 13px">{{ error }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeActions } from '../../util/store.js';

const router = useRouter();
const pin = ref('');
const error = ref('');

function onInput() {
  error.value = '';
  if (pin.value.length === 4) {
    storeActions.saveNewPin(pin.value);
    storeActions.login();
    router.push('/home');
  }
}
</script>
