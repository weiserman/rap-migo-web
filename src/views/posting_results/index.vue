<template>
  <div class="page">
    <MenuTop title="Posting Results" :showBack="false" :showHome="true" />
    <div class="page-content">

      <!-- Overall status banner -->
      <div v-if="allSynced && failCount === 0 && hasOutboxData" class="message-strip strip-success">
        <span class="message-strip-icon">&#10003;</span>
        <span>All {{ confirmedCount }} item(s) synced successfully</span>
      </div>
      <div v-else-if="failCount > 0 && confirmedCount === 0 && hasOutboxData" class="message-strip strip-error">
        <span class="message-strip-icon">&#10007;</span>
        <span>All {{ failCount }} item(s) failed to sync</span>
      </div>
      <div v-else-if="hasOutboxData" class="message-strip strip-warning">
        <span class="message-strip-icon">&#9888;</span>
        <span>{{ confirmedCount }} synced, {{ failCount }} failed, {{ pendingCount }} pending</span>
      </div>
      <div v-else-if="failCount === 0" class="message-strip strip-success">
        <span class="message-strip-icon">&#10003;</span>
        <span>All {{ successCount }} item(s) staged for posting</span>
      </div>
      <div v-else-if="successCount === 0" class="message-strip strip-error">
        <span class="message-strip-icon">&#10007;</span>
        <span>All {{ failCount }} item(s) failed to stage</span>
      </div>
      <div v-else class="message-strip strip-warning">
        <span class="message-strip-icon">&#9888;</span>
        <span>{{ successCount }} staged, {{ failCount }} failed</span>
      </div>

      <!-- Summary counts -->
      <div class="card" style="text-align: center">
        <div style="display: flex; justify-content: center; gap: 24px">
          <div>
            <div style="font-size: 32px; font-weight: 700; color: var(--color-success)">{{ confirmedCount || successCount }}</div>
            <div style="font-size: 13px; color: var(--color-text-secondary)">{{ hasOutboxData ? 'Synced' : 'Staged' }}</div>
          </div>
          <div v-if="hasOutboxData && pendingCount > 0">
            <div style="font-size: 32px; font-weight: 700; color: var(--color-warning)">{{ pendingCount }}</div>
            <div style="font-size: 13px; color: var(--color-text-secondary)">Pending</div>
          </div>
          <div v-if="failCount > 0">
            <div style="font-size: 32px; font-weight: 700; color: var(--color-error)">{{ failCount }}</div>
            <div style="font-size: 13px; color: var(--color-text-secondary)">Failed</div>
          </div>
        </div>
      </div>

      <!-- Outbox-backed item list (when available) -->
      <div v-if="hasOutboxData" class="list-group">
        <div v-for="item in outboxItems" :key="item.id" class="result-item" :class="'result-' + stateClass(item.state)">
          <div class="result-icon">{{ stateIcon(item.state) }}</div>
          <div style="flex: 1">
            <div style="font-weight: 600; font-size: 14px">
              PO {{ item.po_number }}
              <span class="object-status" :class="'status-' + stateClass(item.state)">
                {{ stateLabel(item.state) }}
              </span>
            </div>
            <div v-if="item.state === 'CONFIRMED'" class="result-detail result-detail-success">
              {{ parseResult(item.result_json) }}
            </div>
            <div v-else-if="item.state === 'FAILED'" class="result-detail result-detail-error">
              {{ item.error_msg || 'Unknown error' }}
            </div>
            <div v-else-if="item.state === 'PENDING'" class="result-detail">
              Queued for posting
            </div>
            <div v-else class="result-detail">
              Posting in progress...
            </div>
          </div>
        </div>
      </div>

      <!-- Fallback: original posting results list -->
      <div v-else class="list-group">
        <div v-for="(result, idx) in results" :key="idx" class="result-item" :class="result.success ? 'result-success' : 'result-error'">
          <div class="result-icon">{{ result.success ? '&#10003;' : '&#10007;' }}</div>
          <div>
            <div style="font-weight: 600; font-size: 14px">
              Item {{ idx + 1 }}
              <span v-if="result.materialDocument" style="font-weight: 400; font-size: 12px; color: var(--color-text-secondary)">
                &middot; Mat.Doc {{ result.materialDocument }}
              </span>
            </div>
            <div style="font-size: 13px; color: var(--color-text-secondary); white-space: pre-line">
              {{ result.success ? 'Queued for posting' : result.error || 'Unknown error' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div style="margin-top: 24px; display: flex; gap: 12px">
        <router-link v-if="hasOutboxData && (pendingCount > 0 || failCount > 0)" to="/sync_status" class="btn btn-primary" style="flex: 1; text-align: center; text-decoration: none">
          View Sync Status
        </router-link>
        <router-link to="/po_list" class="btn btn-outline" style="flex: 1; text-align: center; text-decoration: none">
          Back to PO List
        </router-link>
      </div>
      <div style="margin-top: 8px">
        <router-link to="/home" class="btn btn-outline btn-block" style="text-decoration: none">
          Home
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import MenuTop from '../../components/menutop/index.vue';
import { store } from '../../util/store.js';
import { initOutbox, getAllItems } from '../../util/sync/outbox.js';
import { onSyncProgress } from '../../util/sync/index.js';

const results = computed(() => store.cache.postingResults);
const successCount = computed(() => results.value.filter((r) => r.success).length);

const outboxItems = ref([]);
const hasOutboxData = computed(() => outboxItems.value.length > 0);
const confirmedCount = computed(() => outboxItems.value.filter(i => i.state === 'CONFIRMED').length);
const failCount = computed(() => {
  if (hasOutboxData.value) return outboxItems.value.filter(i => i.state === 'FAILED').length;
  return results.value.filter(r => !r.success).length;
});
const pendingCount = computed(() => outboxItems.value.filter(i => i.state === 'PENDING' || i.state === 'IN_FLIGHT').length);
const allSynced = computed(() => pendingCount.value === 0 && failCount.value === 0 && confirmedCount.value > 0);

let unsubscribe = null;

function stateClass(state) {
  switch (state) {
    case 'CONFIRMED': return 'success';
    case 'FAILED': return 'error';
    case 'PENDING': return 'warning';
    case 'IN_FLIGHT': return 'open';
    default: return 'open';
  }
}

function stateLabel(state) {
  switch (state) {
    case 'PENDING': return 'Pending';
    case 'IN_FLIGHT': return 'Syncing';
    case 'CONFIRMED': return 'Synced';
    case 'FAILED': return 'Failed';
    default: return state;
  }
}

function stateIcon(state) {
  switch (state) {
    case 'CONFIRMED': return '\u2713';
    case 'FAILED': return '\u2717';
    case 'PENDING': return '\u25CB';
    case 'IN_FLIGHT': return '\u25D4';
    default: return '\u25CB';
  }
}

function parseResult(json) {
  try {
    const r = JSON.parse(json);
    if (r.materialDocument) return 'Mat.Doc ' + r.materialDocument + (r.materialDocumentYear ? ' / ' + r.materialDocumentYear : '');
    return '';
  } catch {
    return '';
  }
}

async function refreshOutbox() {
  try {
    await initOutbox();
    outboxItems.value = await getAllItems();
  } catch {
    // non-fatal
  }
}

onMounted(async () => {
  await refreshOutbox();
  unsubscribe = onSyncProgress(async () => {
    await refreshOutbox();
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});
</script>

<style scoped>
.result-detail {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}
.result-detail-success {
  color: var(--color-success);
}
.result-detail-error {
  color: var(--color-error);
  white-space: pre-line;
}
.result-warning .result-icon {
  color: var(--color-warning);
}
.result-open .result-icon {
  color: var(--color-primary);
}
</style>
