<template>
  <div class="page">
    <MenuTop title="Activity Log" :showBack="true" />
    <div class="page-content">

      <!-- Filter tabs -->
      <div class="filter-tabs">
        <button class="filter-tab" :class="{ active: filter === 'all' }" @click="filter = 'all'">
          All <span class="filter-count">{{ entries.length }}</span>
        </button>
        <button class="filter-tab" :class="{ active: filter === 'info' }" @click="filter = 'info'">
          Info <span class="filter-count">{{ countByLevel('info') }}</span>
        </button>
        <button class="filter-tab" :class="{ active: filter === 'success' }" @click="filter = 'success'">
          Success <span class="filter-count">{{ countByLevel('success') }}</span>
        </button>
        <button class="filter-tab" :class="{ active: filter === 'warning' }" @click="filter = 'warning'">
          Warn <span class="filter-count">{{ countByLevel('warning') }}</span>
        </button>
        <button class="filter-tab" :class="{ active: filter === 'error' }" @click="filter = 'error'">
          Error <span class="filter-count">{{ countByLevel('error') }}</span>
        </button>
      </div>

      <!-- Log entries -->
      <div v-if="filteredEntries.length > 0" class="log-list">
        <div v-for="(entry, idx) in filteredEntries" :key="idx" class="log-entry" :class="'log-' + entry.level">
          <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
          <span class="log-dot" :class="'dot-' + entry.level"></span>
          <div class="log-body">
            <span class="log-message">{{ entry.message }}</span>
            <span v-if="entry.detail" class="log-detail">{{ entry.detail }}</span>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <div>No activity logged.</div>
      </div>

      <!-- Clear log -->
      <div v-if="entries.length > 0" style="margin-top: 16px; text-align: center">
        <button class="btn btn-sm btn-outline" @click="handleClear">
          Clear Log ({{ entries.length }} entries)
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import MenuTop from '../../components/menutop/index.vue';
import { getLogEntries, clearLog, onLogChange } from '../../util/activityLog.js';

const filter = ref('all');
const entries = ref([]);
let unsubscribe = null;

const filteredEntries = computed(() => {
  if (filter.value === 'all') return entries.value;
  return entries.value.filter((e) => e.level === filter.value);
});

function countByLevel(level) {
  return entries.value.filter((e) => e.level === level).length;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (isToday) return time;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yest ' + time;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

function handleClear() {
  clearLog();
}

onMounted(() => {
  entries.value = getLogEntries();
  unsubscribe = onLogChange((updated) => {
    entries.value = [...updated];
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});
</script>

<style scoped>
.filter-tabs {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: 12px;
}
.filter-tab {
  flex: 1;
  padding: 8px 4px;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-stack);
  border: none;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background 0.15s;
  border-right: 1px solid var(--color-border);
}
.filter-tab:last-child { border-right: none; }
.filter-tab.active {
  background: var(--fiori-blue-light);
  color: var(--color-primary);
}
.filter-count {
  font-weight: 400;
  margin-left: 2px;
  opacity: 0.7;
}

.log-list {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  max-height: 70vh;
  overflow-y: auto;
}
.log-entry {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border);
}
.log-entry:last-child { border-bottom: none; }
.log-time {
  font-family: monospace;
  color: var(--color-text-secondary);
  flex-shrink: 0;
  font-size: 11px;
  min-width: 60px;
}
.log-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 4px;
  flex-shrink: 0;
}
.dot-info { background: var(--color-primary); }
.dot-success { background: var(--color-success); }
.dot-warning { background: var(--color-warning); }
.dot-error { background: var(--color-error); }

.log-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.log-message {
  font-weight: 500;
}
.log-detail {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.log-error {
  background: var(--fiori-red-light);
}
.log-warning {
  background: var(--fiori-orange-light);
}
</style>
