/**
 * Shared Activity Log — persisted to localStorage for cross-view access.
 *
 * Used by the scanner view, sync engine, and dedicated activity log page.
 * Entries are capped at MAX_ENTRIES (FIFO eviction).
 */

const STORAGE_KEY = 'migo_gr_activity_log';
const MAX_ENTRIES = 200;

// In-memory reactive list — kept in sync with localStorage
let entries = [];
let listeners = new Set();

function load() {
  try {
    entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    entries = [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function notify() {
  listeners.forEach((fn) => {
    try { fn(entries); } catch { /* non-fatal */ }
  });
}

// Load on module init
load();

/**
 * Add a log entry.
 * @param {'info'|'success'|'warning'|'error'} level
 * @param {string} message
 * @param {string} [detail]
 */
export function addLogEntry(level, message, detail) {
  entries.unshift({
    timestamp: Date.now(),
    level,
    message,
    detail: detail || '',
  });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  persist();
  notify();
}

/**
 * Get all log entries (newest first).
 * @returns {Array}
 */
export function getLogEntries() {
  return entries;
}

/**
 * Clear all log entries.
 */
export function clearLog() {
  entries.length = 0;
  persist();
  notify();
}

/**
 * Subscribe to log changes.
 * @param {Function} callback
 * @returns {Function} Unsubscribe function
 */
export function onLogChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
