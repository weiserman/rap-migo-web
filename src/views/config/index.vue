<template>
  <div class="page">
    <MenuTop title="Configuration" :showBack="true" />
    <div class="page-content">
      <div class="form-group">
        <label class="form-label">SAP Host</label>
        <input class="form-input" v-model="form.baseHost" placeholder="https://host:port" />
      </div>
      <div class="form-group">
        <label class="form-label">Service Path</label>
        <input class="form-input" v-model="form.poPath" placeholder="/sap/opu/odata4/..." />
      </div>
      <div class="form-group">
        <label class="form-label">Username</label>
        <input class="form-input" v-model="form.username" autocomplete="off" />
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input class="form-input" v-model="form.password" type="password" autocomplete="off" />
      </div>
      <div class="form-group">
        <label class="form-label">Plant</label>
        <input class="form-input" v-model="form.plant" placeholder="1010" />
      </div>
      <div class="form-group">
        <label class="form-label">Timeout (ms)</label>
        <input class="form-input" v-model.number="form.networkTimeoutMs" type="number" />
      </div>

      <button class="btn btn-primary btn-block" @click="save">Save Configuration</button>

      <div style="margin-top: 24px">
        <button class="btn btn-outline btn-block" @click="testConnection" :disabled="testing">
          {{ testing ? 'Testing...' : 'Test Connection' }}
        </button>
      </div>

      <div v-if="testResult" style="margin-top: 12px" class="card">
        <div :class="testResult.ok ? 'badge-complete' : 'badge-error'" style="padding: 8px; border-radius: 4px; text-align: left; word-break: break-word; font-size: 0.85rem; line-height: 1.5; white-space: pre-line">
          {{ testResult.message }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import MenuTop from '../../components/menutop/index.vue';
import { store, storeActions } from '../../util/store.js';
import { EntityService } from '../../util/entities.js';
import { resetCsrfToken } from '../../util/odata.js';

const form = reactive({
  baseHost: store.config.baseHost,
  poPath: store.config.poPath,
  username: store.config.username,
  password: store.config.password,
  plant: store.plant,
  networkTimeoutMs: store.config.networkTimeoutMs,
});

const testResult = ref(null);
const testing = ref(false);

function save() {
  storeActions.saveODataConfig(
    form.baseHost, form.poPath, form.poPath,
    form.username, form.password,
    form.networkTimeoutMs, store.config.sapClient
  );
  storeActions.setPlant(form.plant);
  resetCsrfToken();
  alert('Configuration saved.');
}

async function testConnection() {
  testResult.value = null;
  testing.value = true;

  // Validate configuration before testing
  if (!form.baseHost || !form.poPath) {
    testResult.value = { ok: false, message: 'SAP Host and Service Path are required.' };
    testing.value = false;
    return;
  }

  // Save config first so the OData client uses latest values
  storeActions.saveODataConfig(
    form.baseHost, form.poPath, form.poPath,
    form.username, form.password,
    form.networkTimeoutMs, store.config.sapClient
  );
  storeActions.setPlant(form.plant);
  resetCsrfToken();

  try {
    const { count } = await EntityService.getDeliveriesList(form.plant, { top: 1 });
    testResult.value = { ok: true, message: `Connected successfully. ${count} PO(s) found for plant ${form.plant}.` };
  } catch (err) {
    testResult.value = { ok: false, message: err.message || 'Unknown error' };
  } finally {
    testing.value = false;
  }
}
</script>
