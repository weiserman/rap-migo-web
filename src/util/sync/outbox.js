/**
 * Durable Outbox — localStorage-backed transaction queue.
 *
 * State machine: PENDING → IN_FLIGHT → CONFIRMED | FAILED
 * On app restart, IN_FLIGHT items reset to PENDING (safe to retry
 * because of RAP idempotency guard on the server).
 *
 * Uses localStorage for persistence — survives app kill and low-memory
 * eviction. Avoids AHM SQLite path-resolution issues entirely.
 */

const STORAGE_KEY = 'migo_gr_outbox';

let initialized = false;

// ─── Storage Helpers ──────────────────────────────────────

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function save(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ─── Init ─────────────────────────────────────────────────

/**
 * Initialize the outbox. Resets any IN_FLIGHT items to PENDING
 * (app-restart recovery — items that were mid-flight when the app died).
 * Safe to call multiple times.
 */
export async function initOutbox() {
  if (initialized) return;
  const items = load();
  let changed = false;
  for (const item of items) {
    if (item.state === 'IN_FLIGHT') {
      item.state = 'PENDING';
      item.updated_at = Date.now();
      changed = true;
    }
  }
  if (changed) save(items);
  initialized = true;
}

// ─── Enqueue ──────────────────────────────────────────────

/**
 * Add a new transaction to the outbox.
 * @param {Object} item
 * @param {string} item.id          - UUID (idempotency key / PostingID)
 * @param {string} item.operator_id - User identity
 * @param {string} item.po_number   - PurchaseOrder number
 * @param {Object} item.payload     - Full GR body (will be JSON-stringified)
 */
export async function enqueue(item) {
  await initOutbox();
  const items = load();
  const now = Date.now();
  items.push({
    id: item.id,
    created_at: now,
    operator_id: item.operator_id,
    po_number: item.po_number,
    payload: typeof item.payload === 'string' ? item.payload : JSON.stringify(item.payload),
    state: 'PENDING',
    error_msg: '',
    result_json: '',
    attempts: 0,
    updated_at: now,
  });
  save(items);
}

// ─── Query ────────────────────────────────────────────────

/**
 * Get the oldest PENDING item from the outbox.
 * @returns {Promise<Object|null>}
 */
export async function getNextPending() {
  await initOutbox();
  const items = load()
    .filter(i => i.state === 'PENDING')
    .sort((a, b) => a.created_at - b.created_at);
  return items.length > 0 ? items[0] : null;
}

/**
 * Count items in PENDING or IN_FLIGHT state.
 * @returns {Promise<number>}
 */
export async function getPendingCount() {
  await initOutbox();
  return load().filter(i => i.state === 'PENDING' || i.state === 'IN_FLIGHT').length;
}

/**
 * Get all FAILED items for operator review.
 * @returns {Promise<Array>}
 */
export async function getFailedItems() {
  await initOutbox();
  return load()
    .filter(i => i.state === 'FAILED')
    .sort((a, b) => a.created_at - b.created_at);
}

/**
 * Get recently CONFIRMED items (for audit/display).
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getConfirmedRecent(limit = 20) {
  await initOutbox();
  return load()
    .filter(i => i.state === 'CONFIRMED')
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, limit);
}

/**
 * Get all items regardless of state (for display).
 * @returns {Promise<Array>}
 */
export async function getAllItems() {
  await initOutbox();
  return load().sort((a, b) => b.created_at - a.created_at);
}

// ─── State Transitions ────────────────────────────────────

/**
 * Mark an item as IN_FLIGHT (posting in progress).
 * Increments the attempts counter.
 * @param {string} id
 */
export async function markInFlight(id) {
  const items = load();
  const item = items.find(i => i.id === id);
  if (item) {
    item.state = 'IN_FLIGHT';
    item.attempts = (item.attempts || 0) + 1;
    item.updated_at = Date.now();
    save(items);
  }
}

/**
 * Mark an item as CONFIRMED (server accepted, material document created).
 * @param {string} id
 * @param {Object} result - Server response (materialDocument, etc.)
 */
export async function markConfirmed(id, result) {
  const items = load();
  const item = items.find(i => i.id === id);
  if (item) {
    item.state = 'CONFIRMED';
    item.result_json = typeof result === 'string' ? result : JSON.stringify(result);
    item.updated_at = Date.now();
    save(items);
  }
}

/**
 * Mark an item as FAILED with a human-readable reason.
 * @param {string} id
 * @param {string} reason
 */
export async function markFailed(id, reason) {
  const items = load();
  const item = items.find(i => i.id === id);
  if (item) {
    item.state = 'FAILED';
    item.error_msg = reason;
    item.updated_at = Date.now();
    save(items);
  }
}

// ─── Operator Actions ─────────────────────────────────────

/**
 * Retry a FAILED item — reset to PENDING.
 * @param {string} id
 */
export async function retryItem(id) {
  const items = load();
  const item = items.find(i => i.id === id);
  if (item) {
    item.state = 'PENDING';
    item.error_msg = '';
    item.updated_at = Date.now();
    save(items);
  }
}

/**
 * Discard an item — remove from outbox entirely.
 * @param {string} id
 */
export async function discardItem(id) {
  await initOutbox();
  const items = load().filter(i => i.id !== id);
  save(items);
}

/**
 * Purge old CONFIRMED items (older than given age in ms).
 * @param {number} maxAgeMs - Max age in milliseconds (default: 24 hours)
 */
export async function purgeOldConfirmed(maxAgeMs = 86400000) {
  await initOutbox();
  const cutoff = Date.now() - maxAgeMs;
  const items = load().filter(i =>
    !(i.state === 'CONFIRMED' && i.updated_at < cutoff)
  );
  save(items);
}
