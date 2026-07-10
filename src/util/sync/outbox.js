/**
 * Durable Outbox — SQLite-backed transaction queue.
 * Uses AHM's /api/database/ REST API for persistence.
 * Survives app kill, low-memory eviction, and device reboot.
 *
 * State machine: PENDING → IN_FLIGHT → CONFIRMED | FAILED
 * On app restart, IN_FLIGHT items reset to PENDING (safe to retry
 * because of RAP idempotency guard on the server).
 */

const DB_NAME = 'migo_gr_outbox';
const DB_API = '/api/database';

let initialized = false;

// ─── AHM Database REST Client ─────────────────────────────

async function dbExecute(sql, params = []) {
  const res = await fetch(`${DB_API}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: DB_NAME, sql, params }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DB execute failed (${res.status}): ${text}`);
  }
  return res.json().catch(() => ({ rowsAffected: 0 }));
}

async function dbQuery(sql, params = []) {
  const res = await fetch(`${DB_API}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: DB_NAME, sql, params }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DB query failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.rows || data.results || [];
}

// ─── Schema Init ──────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS outbox (
  id          TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  operator_id TEXT NOT NULL,
  po_number   TEXT NOT NULL,
  payload     TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT 'PENDING',
  error_msg   TEXT DEFAULT '',
  result_json TEXT DEFAULT '',
  attempts    INTEGER DEFAULT 0,
  updated_at  INTEGER DEFAULT 0
)`;

const INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_outbox_state ON outbox(state, created_at)`;

/**
 * Initialize the outbox database. Creates the table and index if they
 * don't exist. Also resets any IN_FLIGHT items to PENDING (app-restart
 * recovery — items that were mid-flight when the app died).
 * Safe to call multiple times.
 */
export async function initOutbox() {
  if (initialized) return;

  // Create/open the database file
  await fetch(`${DB_API}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: DB_NAME }),
  });

  await dbExecute(SCHEMA_SQL);
  await dbExecute(INDEX_SQL);

  // Recovery: reset IN_FLIGHT → PENDING (app was killed mid-flight)
  await dbExecute(
    `UPDATE outbox SET state = 'PENDING', updated_at = ? WHERE state = 'IN_FLIGHT'`,
    [Date.now()]
  );

  initialized = true;
}

// ─── Enqueue ──────────────────────────────────────────────

/**
 * Add a new transaction to the outbox.
 * The item.id is the client-generated UUID that serves as the
 * idempotency key (same value sent as PostingID to the RAP BO).
 *
 * @param {Object} item
 * @param {string} item.id          - UUID (idempotency key / PostingID)
 * @param {string} item.operator_id - User identity
 * @param {string} item.po_number   - PurchaseOrder number
 * @param {Object} item.payload     - Full GR body (will be JSON-stringified)
 * @returns {Promise<void>}
 */
export async function enqueue(item) {
  await initOutbox();
  const now = Date.now();
  const payloadStr = typeof item.payload === 'string'
    ? item.payload
    : JSON.stringify(item.payload);

  await dbExecute(
    `INSERT INTO outbox (id, created_at, operator_id, po_number, payload, state, error_msg, result_json, attempts, updated_at)
     VALUES (?, ?, ?, ?, ?, 'PENDING', '', '', 0, ?)`,
    [item.id, now, item.operator_id, item.po_number, payloadStr, now]
  );
}

// ─── Query ────────────────────────────────────────────────

/**
 * Get the oldest PENDING item from the outbox.
 * @returns {Promise<Object|null>}
 */
export async function getNextPending() {
  await initOutbox();
  const rows = await dbQuery(
    `SELECT * FROM outbox WHERE state = 'PENDING' ORDER BY created_at ASC LIMIT 1`
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Count items in PENDING or IN_FLIGHT state.
 * @returns {Promise<number>}
 */
export async function getPendingCount() {
  await initOutbox();
  const rows = await dbQuery(
    `SELECT COUNT(*) as cnt FROM outbox WHERE state IN ('PENDING', 'IN_FLIGHT')`
  );
  return rows.length > 0 ? (rows[0].cnt || 0) : 0;
}

/**
 * Get all FAILED items for operator review.
 * @returns {Promise<Array>}
 */
export async function getFailedItems() {
  await initOutbox();
  return dbQuery(
    `SELECT * FROM outbox WHERE state = 'FAILED' ORDER BY created_at ASC`
  );
}

/**
 * Get recently CONFIRMED items (for audit/display).
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getConfirmedRecent(limit = 20) {
  await initOutbox();
  return dbQuery(
    `SELECT * FROM outbox WHERE state = 'CONFIRMED' ORDER BY updated_at DESC LIMIT ?`,
    [limit]
  );
}

/**
 * Get all items regardless of state (for diagnostics).
 * @returns {Promise<Array>}
 */
export async function getAllItems() {
  await initOutbox();
  return dbQuery(
    `SELECT * FROM outbox ORDER BY created_at DESC`
  );
}

// ─── State Transitions ────────────────────────────────────

/**
 * Mark an item as IN_FLIGHT (posting in progress).
 * Increments the attempts counter.
 * @param {string} id
 */
export async function markInFlight(id) {
  const now = Date.now();
  await dbExecute(
    `UPDATE outbox SET state = 'IN_FLIGHT', attempts = attempts + 1, updated_at = ? WHERE id = ?`,
    [now, id]
  );
}

/**
 * Mark an item as CONFIRMED (server accepted, material document created).
 * @param {string} id
 * @param {Object} result - Server response (materialDocument, etc.)
 */
export async function markConfirmed(id, result) {
  const now = Date.now();
  const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
  await dbExecute(
    `UPDATE outbox SET state = 'CONFIRMED', result_json = ?, updated_at = ? WHERE id = ?`,
    [resultStr, now, id]
  );
}

/**
 * Mark an item as FAILED with a human-readable reason.
 * @param {string} id
 * @param {string} reason
 */
export async function markFailed(id, reason) {
  const now = Date.now();
  await dbExecute(
    `UPDATE outbox SET state = 'FAILED', error_msg = ?, updated_at = ? WHERE id = ?`,
    [reason, now, id]
  );
}

// ─── Operator Actions ─────────────────────────────────────

/**
 * Retry a FAILED item — reset to PENDING.
 * @param {string} id
 */
export async function retryItem(id) {
  const now = Date.now();
  await dbExecute(
    `UPDATE outbox SET state = 'PENDING', error_msg = '', updated_at = ? WHERE id = ?`,
    [now, id]
  );
}

/**
 * Discard an item — remove from outbox entirely.
 * @param {string} id
 */
export async function discardItem(id) {
  await initOutbox();
  await dbExecute(`DELETE FROM outbox WHERE id = ?`, [id]);
}

/**
 * Purge old CONFIRMED items (older than given age in ms).
 * @param {number} maxAgeMs - Max age in milliseconds (default: 24 hours)
 */
export async function purgeOldConfirmed(maxAgeMs = 86400000) {
  await initOutbox();
  const cutoff = Date.now() - maxAgeMs;
  await dbExecute(
    `DELETE FROM outbox WHERE state = 'CONFIRMED' AND updated_at < ?`,
    [cutoff]
  );
}
