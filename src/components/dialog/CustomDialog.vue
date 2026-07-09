<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="onOverlayClick">
      <div class="dialog-box">
        <div v-if="title" class="dialog-title">{{ title }}</div>
        <div class="dialog-body">{{ message }}</div>
        <div v-if="inputMode">
          <input
            ref="inputRef"
            v-model="inputValue"
            class="form-input"
            :type="inputType"
            :placeholder="inputPlaceholder"
            @keyup.enter="onOk"
          />
        </div>
        <div class="dialog-actions">
          <button v-if="showCancel" class="btn btn-outline btn-sm" @click="onCancel">Cancel</button>
          <button class="btn btn-primary btn-sm" @click="onOk">{{ okLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, nextTick } from 'vue';
import { useDialog } from './useDialog.js';

const { state } = useDialog();
const inputRef = ref(null);
const pendingResolve = ref(null);

const visible = ref(false);
const title = ref('');
const message = ref('');
const okLabel = ref('OK');
const showCancel = ref(false);
const inputMode = ref(false);
const inputType = ref('text');
const inputPlaceholder = ref('');
const inputValue = ref('');

function showDialog(config) {
  title.value = config.title || '';
  message.value = config.message || '';
  okLabel.value = config.okLabel || 'OK';
  showCancel.value = config.showCancel || false;
  inputMode.value = config.inputMode || false;
  inputType.value = config.inputType || 'text';
  inputPlaceholder.value = config.inputPlaceholder || '';
  inputValue.value = config.inputValue || '';
  visible.value = true;
  if (config.inputMode) {
    nextTick(() => inputRef.value?.focus());
  }
  return new Promise((res) => {
    pendingResolve.value = res;
  });
}

function doResolve(value) {
  const res = pendingResolve.value;
  pendingResolve.value = null;
  if (res) res(value);
}

function onOk() {
  visible.value = false;
  doResolve(inputMode.value ? inputValue.value : true);
}

function onCancel() {
  visible.value = false;
  doResolve(inputMode.value ? null : false);
}

function onOverlayClick() {
  if (!showCancel.value) return;
  onCancel();
}

// Expose to window via useDialog state
Object.assign(state, { showDialog });
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.dialog-box {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 24px;
  min-width: 280px;
  max-width: 90vw;
}
.dialog-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}
.dialog-body {
  font-size: 14px;
  margin-bottom: 16px;
  white-space: pre-wrap;
  color: var(--color-text-secondary);
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
