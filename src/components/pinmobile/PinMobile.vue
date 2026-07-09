<template>
  <div class="pin-screen">
    <div class="pin-header">
      <h2 class="pin-title">{{ title }}</h2>
      <p v-if="errorMessage" class="pin-error">{{ errorMessage }}</p>
    </div>

    <div class="pin-dots">
      <span
        v-for="index in length"
        :key="index"
        class="pin-dot"
        :class="{ 'is-active': index <= pin.length }"
      ></span>
    </div>

    <div class="pin-grid">
      <button v-for="num in 9" :key="num" class="grid-btn" @click="pressNum(num)">
        {{ num }}
      </button>
      <button class="grid-btn functional-btn" @click="clearAll">C</button>
      <button class="grid-btn" @click="pressNum(0)">0</button>
      <button class="grid-btn functional-btn" @click="pressDelete">⌫</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';

const props = defineProps({
  length: { type: Number, default: 4 },
  title: { type: String, default: 'Enter PIN' },
  errorMessage: { type: String, default: '' },
});

const emit = defineEmits(['submit']);
const pin = ref('');

const pressNum = (num) => {
  if (pin.value.length < props.length) {
    pin.value += num.toString();
    if (pin.value.length === props.length) {
      nextTick(() => {
        emit('submit', pin.value);
      });
    }
  }
};

const pressDelete = () => {
  pin.value = pin.value.slice(0, -1);
};

const clearAll = () => {
  pin.value = '';
};

const handleGlobalKeydown = (event) => {
  if (/^\d$/.test(event.key)) {
    pressNum(parseInt(event.key, 10));
  } else if (event.key === 'Backspace') {
    pressDelete();
  } else if (event.key === 'Escape' || event.key === 'Delete') {
    clearAll();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
});
onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
});

defineExpose({ clearAll });
</script>

<style scoped>
.pin-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 320px;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
}
.pin-header {
  text-align: center;
  margin-bottom: 40px;
  min-height: 60px;
}
.pin-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 8px 0;
}
.pin-error {
  color: var(--color-error);
  font-size: 13px;
  margin: 0;
}
.pin-dots {
  display: flex;
  gap: 20px;
  margin-bottom: 50px;
}
.pin-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  transition: all 0.1s ease;
}
.pin-dot.is-active {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  transform: scale(1.15);
}
.pin-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  width: 100%;
}
.grid-btn {
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  background-color: var(--color-surface);
  font-size: 24px;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  transition: background-color 0.1s ease, border-color 0.1s ease;
}
.grid-btn:active {
  background-color: var(--fiori-blue-light);
  border-color: var(--color-primary);
}
.functional-btn {
  font-size: 18px;
  background-color: transparent;
  border-color: transparent;
  color: var(--color-text-secondary);
}
.functional-btn:active {
  background-color: rgba(0, 0, 0, 0.05);
  color: var(--color-text);
}
</style>
