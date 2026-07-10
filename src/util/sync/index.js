/**
 * Sync Engine — public API.
 * Re-exports outbox and engine functions for the MIGO GR frontend.
 */

// Outbox (durable queue)
export {
  initOutbox,
  enqueue,
  getNextPending,
  getPendingCount,
  getFailedItems,
  getConfirmedRecent,
  getAllItems,
  markInFlight,
  markConfirmed,
  markFailed,
  retryItem,
  discardItem,
  purgeOldConfirmed,
} from './outbox.js';

// Engine (replay loop)
export {
  replayOutbox,
  onSyncProgress,
  setupAutoTrigger,
  startSyncEngine,
  isSyncing,
} from './engine.js';
