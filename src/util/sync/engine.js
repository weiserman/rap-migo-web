/**
 * Sync Engine — replays the durable outbox to the SAP backend.
 *
 * Runs the replay loop: fetches PENDING items oldest-first, posts each
 * as a single-document $batch, and updates state based on the response.
 *
 * Transport failures use exponential backoff with jitter.
 * Business failures are surfaced to the operator for review.
 *
 * Concurrency: a single `syncing` lock prevents overlapping replay loops.
 */

import {
  initOutbox,
  getNextPending,
  markInFlight,
  markConfirmed,
  markFailed,
  getPendingCount,
} from './outbox.js';
import { store } from '../store.js';

// ─── Constants ────────────────────────────────────────────

const MAX_TRANSPORT_RETRIES = 5;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;

// ─── State ────────────────────────────────────────────────

let syncing = false;
let listeners = new Set();

// ─── Exponential Backoff ──────────────────────────────────

/**
 * Calculate backoff delay with exponential growth and random jitter.
 * @param {number} attempt - Current attempt number (0-based)
 * @returns {number} Delay in milliseconds
 */
function backoff(attempt) {
  const jitter = Math.random() * 500;
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt) + jitter, BACKOFF_MAX_MS);
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Progress Notification ────────────────────────────────

/**
 * Notify all registered listeners of sync progress.
 * @param {Object} progress
 * @param {number} progress.pending  - Remaining PENDING items
 * @param {number} progress.confirmed - Total confirmed this session
 * @param {number} progress.failed   - Total failed this session
 * @param {string} progress.status   - 'syncing' | 'idle' | 'error'
 * @param {Object} [progress.lastResult] - Most recent item result
 */
function notifyProgress(progress) {
  listeners.forEach((fn) => {
    try {
      fn(progress);
    } catch {
      // Listener errors are non-fatal
    }
  });
}

/**
 * Subscribe to sync progress updates.
 * @param {Function} callback - Called with progress object
 * @returns {Function} Unsubscribe function
 */
export function onSyncProgress(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// ─── Core Replay Loop ─────────────────────────────────────

/**
 * Get the EntityService dynamically to avoid circular imports.
 * The EntityService imports from odata.js which imports from store.js;
 * importing it here at call time breaks the cycle.
 */
async function getEntityService() {
  const mod = await import('../entities.js');
  return mod.EntityService;
}

/**
 * Replay all PENDING items in the outbox.
 *
 * For each item:
 *   1. Mark IN_FLIGHT (increments attempts)
 *   2. Post via single-document $batch
 *   3. On success → mark CONFIRMED with material document
 *   4. On business error → mark FAILED with reason
 *   5. On transport error → backoff + retry (up to MAX_TRANSPORT_RETRIES)
 *
 * @param {Function} [onProgress] - Optional progress callback
 * @returns {Promise<{confirmed: number, failed: number}>}
 */
export async function replayOutbox(onProgress) {
  if (syncing) {
    console.log('[Sync] Replay already running, skipping');
    return { confirmed: 0, failed: 0 };
  }

  syncing = true;
  let confirmed = 0;
  let failed = 0;

  try {
    await initOutbox();

    // Update store with current pending count
    const pendingCount = await getPendingCount();
    store.sync.pendingCount = pendingCount;
    store.sync.syncError = null;

    while (true) {
      const item = await getNextPending();
      if (!item) break; // No more PENDING items

      const remaining = await getPendingCount();
      notifyProgress({
        pending: remaining,
        confirmed,
        failed,
        status: 'syncing',
      });
      if (onProgress) onProgress({ pending: remaining, confirmed, failed, status: 'syncing' });

      let transportRetries = 0;
      let posted = false;

      // Notify: item transitioning to IN_FLIGHT
      notifyProgress({
        pending: remaining,
        confirmed,
        failed,
        status: 'syncing',
        lastResult: { id: item.id, po_number: item.po_number, state: 'IN_FLIGHT', attempt: item.attempts + 1 },
      });

      while (!posted && transportRetries <= MAX_TRANSPORT_RETRIES) {
        try {
          // Mark IN_FLIGHT before each attempt
          await markInFlight(item.id);

          // Post via EntityService (single-doc $batch)
          const EntityService = await getEntityService();
          const result = await EntityService.postFromOutbox(item);

          if (result.success) {
            // Business success — mark CONFIRMED
            await markConfirmed(item.id, {
              materialDocument: result.materialDocument,
              materialDocumentYear: result.materialDocumentYear,
            });
            confirmed++;
            posted = true;

            notifyProgress({
              pending: await getPendingCount(),
              confirmed,
              failed,
              status: 'syncing',
              lastResult: { id: item.id, po_number: item.po_number, success: true, state: 'CONFIRMED', ...result },
            });
          } else {
            // Business error — mark FAILED (no retry)
            await markFailed(item.id, result.error || 'Unknown business error');
            failed++;
            posted = true;

            notifyProgress({
              pending: await getPendingCount(),
              confirmed,
              failed,
              status: 'syncing',
              lastResult: { id: item.id, po_number: item.po_number, success: false, state: 'FAILED', error: result.error },
            });
          }
        } catch (err) {
          // Transport error — backoff and retry
          transportRetries++;
          if (transportRetries > MAX_TRANSPORT_RETRIES) {
            // Exhausted retries — mark FAILED
            const failReason = `Network unreachable after ${MAX_TRANSPORT_RETRIES} attempts: ${err.message}`;
            await markFailed(item.id, failReason);
            failed++;
            posted = true;

            store.sync.syncError = `Failed to post ${item.po_number}: ${err.message}`;
            notifyProgress({
              pending: await getPendingCount(),
              confirmed,
              failed,
              status: 'syncing',
              lastResult: { id: item.id, po_number: item.po_number, success: false, state: 'FAILED', error: failReason },
            });
          } else {
            // Wait before retry
            const delay = backoff(transportRetries);
            console.log(`[Sync] Transport error, retrying in ${Math.round(delay)}ms (attempt ${transportRetries}/${MAX_TRANSPORT_RETRIES})`);
            await sleep(delay);
          }
        }
      }
    }

    // Update final state
    const finalPending = await getPendingCount();
    store.sync.pendingCount = finalPending;
    store.sync.lastSyncTime = Date.now();

    const finalStatus = failed > 0 ? 'error' : 'idle';
    notifyProgress({ pending: finalPending, confirmed, failed, status: finalStatus });
    if (onProgress) onProgress({ pending: finalPending, confirmed, failed, status: finalStatus });

    return { confirmed, failed };
  } catch (err) {
    console.error('[Sync] Replay loop error:', err);
    store.sync.syncError = err.message;
    notifyProgress({ pending: store.sync.pendingCount, confirmed, failed, status: 'error' });
    return { confirmed, failed };
  } finally {
    syncing = false;
  }
}

// ─── Auto-Trigger ─────────────────────────────────────────

let autoTriggerSetup = false;

/**
 * Set up automatic replay triggers:
 * - On app online/offline connectivity changes
 * - Returns a cleanup function
 */
export function setupAutoTrigger() {
  if (autoTriggerSetup) return () => {};
  autoTriggerSetup = true;

  const handleOnline = () => {
    store.sync.isOnline = true;
    console.log('[Sync] Device online');
    // No auto-replay -- user must tap "Sync Now"
  };

  const handleOffline = () => {
    store.sync.isOnline = false;
    console.log('[Sync] Device offline — pausing replay');
  };

  // Use window events for connectivity detection (works in WebView)
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial online state
    if (typeof navigator !== 'undefined') {
      store.sync.isOnline = navigator.onLine !== false;
    }
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
    autoTriggerSetup = false;
  };
}

/**
 * Check if the sync engine is currently running a replay loop.
 * @returns {boolean}
 */
export function isSyncing() {
  return syncing;
}

/**
 * Start the sync engine — initializes the outbox, recovers any
 * in-flight items, and sets up connectivity listeners.
 * Called once on app startup.
 * Items wait for explicit "Sync Now" — no auto-replay.
 */
export async function startSyncEngine() {
  await initOutbox();
  setupAutoTrigger();
  // No auto-replay -- items wait for explicit "Sync Now"
}
