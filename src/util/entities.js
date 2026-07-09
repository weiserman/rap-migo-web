/**
 * Entity normalizers and service layer for ZUI_MIGO_GR_V4.
 * Maps SAP CDS entity fields to frontend-friendly objects.
 */
import { odataFetch, odataBatch, generateId } from './odata.js';
import { store } from './store.js';

// ─── Normalizers ──────────────────────────────────────────

function formatSAPDate(dateStr) {
  if (!dateStr) return '';
  // SAP returns dates as "2026-07-09T00:00:00Z" or "2026-07-09"
  const d = dateStr.substring(0, 10);
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
  return dateStr;
}

/**
 * Normalize a PO header from SAP to frontend model.
 */
function normalizePO(sapHeader) {
  if (!sapHeader) return null;
  return {
    PurchaseOrder: sapHeader.PurchaseOrder || '',
    OrderType: sapHeader.OrderType || '',
    Supplier: sapHeader.Supplier || '',
    SupplierName: sapHeader.SupplierName || 'Unknown',
    PurchaseOrderDate: formatSAPDate(sapHeader.PurchaseOrderDate),
    Plant: sapHeader.Plant || '',
    ItemCount: parseInt(sapHeader.ItemCount || 0, 10),
    OpenItemCount: parseInt(sapHeader.OpenItemCount || 0, 10),
    OverallStatus: sapHeader.OverallStatus || '',
    _Items: Array.isArray(sapHeader._Items)
      ? sapHeader._Items.map(normalizePOItem)
      : [],
  };
}

/**
 * Normalize a PO item from SAP to frontend model.
 */
function normalizePOItem(sapItem) {
  if (!sapItem) return null;
  return {
    id: `${sapItem.PurchaseOrder}-${sapItem.PurchaseOrderItem}`,
    PurchaseOrder: sapItem.PurchaseOrder || '',
    PurchaseOrderItem: sapItem.PurchaseOrderItem || '',
    Material: sapItem.Material || '',
    MaterialDescription: sapItem.MaterialDescription || '',
    Plant: sapItem.Plant || '',
    StorageLocation: sapItem.StorageLocation || '',
    OrderQuantity: parseFloat(sapItem.OrderQuantity || 0),
    OpenQuantity: parseFloat(sapItem.OpenQuantity || 0),
    ReceivedQuantity: parseFloat(sapItem.ReceivedQuantity || 0),
    OrderUnit: sapItem.OrderUnit || sapItem.EntryUnit || 'EA',
    BaseUnit: sapItem.BaseUnit || 'EA',
    PrimaryEAN: sapItem.PrimaryEAN || '',
    PrimaryEANUnit: sapItem.PrimaryEANUnit || '',
    CartonEAN: sapItem.CartonEAN || '',
    CartonEANUnit: sapItem.CartonEANUnit || '',
    IsCompletelyDelivered: sapItem.IsCompletelyDelivered === 'X',
    GoodsReceiptIsExpected: sapItem.GoodsReceiptIsExpected === 'X',
    recptQty: 0,
    targetQty: Math.floor(parseFloat(sapItem.OpenQuantity || 0)),
  };
}

// ─── Entity Service ───────────────────────────────────────

export const EntityService = {
  /**
   * Fetch PO list filtered by plant.
   */
  async getDeliveriesList(plant, options = {}) {
    let filter = `Plant eq '${plant}'`;
    if (options.supplier) filter += ` and Supplier eq '${options.supplier}'`;

    const top = options.top || 50;
    const orderby = options.orderby || 'PurchaseOrderDate desc';
    const select =
      'PurchaseOrder,OrderType,Supplier,SupplierName,PurchaseOrderDate,Plant,ItemCount,OpenItemCount,OverallStatus';

    const endpoint = `PurchaseOrders?$filter=${filter}&$orderby=${orderby}&$top=${top}&$count=true&$select=${select}`;
    const response = await odataFetch(endpoint, { method: 'GET' });

    const rawList = response.value || [];
    const count = response['@odata.count'] || rawList.length;
    const items = rawList.map(normalizePO);

    // Cache in store
    store.cache.poList = items;
    store.cache.poListCount = count;

    return { items, count };
  },

  /**
   * Fetch PO items for a specific PO.
   */
  async getPoItems(poNumber) {
    const select =
      'PurchaseOrderItem,Material,MaterialDescription,Plant,StorageLocation,OrderQuantity,OpenQuantity,ReceivedQuantity,OrderUnit,BaseUnit,PrimaryEAN,PrimaryEANUnit,CartonEAN,CartonEANUnit,IsCompletelyDelivered,GoodsReceiptIsExpected';

    const endpoint = `PurchaseOrders('${poNumber}')/_Items?$select=${select}`;
    const response = await odataFetch(endpoint, { method: 'GET' });

    const items = (response.value || []).map(normalizePOItem);
    storeActions_cacheItems(poNumber, items);
    return items;
  },

  /**
   * Fetch a single PO header by number (with items expanded).
   */
  async getPoHeader(poNumber) {
    const select =
      'PurchaseOrder,OrderType,Supplier,SupplierName,PurchaseOrderDate,Plant,ItemCount,OpenItemCount,OverallStatus';
    const itemSelect =
      'PurchaseOrderItem,Material,MaterialDescription,Plant,StorageLocation,OrderQuantity,OpenQuantity,ReceivedQuantity,OrderUnit,BaseUnit,PrimaryEAN,PrimaryEANUnit,CartonEAN,CartonEANUnit,IsCompletelyDelivered,GoodsReceiptIsExpected';

    const endpoint = `PurchaseOrders('${poNumber}')?$select=${select}&$expand=_Items($select=${itemSelect})`;
    const response = await odataFetch(endpoint, { method: 'GET' });

    const po = normalizePO(response);
    if (po) {
      storeActions_cacheItems(poNumber, po._Items);
      storeActions_addToPoHistory(po);
    }
    return po;
  },

  /**
   * Post a single GR item via direct CREATE.
   */
  async postGoodsReceipt(stagingItem, poHeader) {
    const body = buildGRBody(stagingItem, poHeader);

    try {
      const response = await odataFetch('GRPostings', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return {
        success: true,
        postingId: body.PostingID,
        materialDocument: response.MaterialDocument || '',
        materialDocumentYear: response.MaterialDocumentYear || '',
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        postingId: body.PostingID,
      };
    }
  },

  /**
   * Post multiple GR items — tries OData $batch first, falls back to sequential.
   */
  async postGoodsReceipts(stagingItems, poHeader, onProgress) {
    store.cache.postingInProgress = true;

    let results;
    try {
      results = await postBatch(stagingItems, poHeader, onProgress);
    } catch {
      // Batch failed — fall back to sequential
      results = await postSequential.call(this, stagingItems, poHeader, onProgress);
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    store.cache.postingInProgress = false;
    store.cache.postingResults = results;

    return { results, successCount, failCount };
  },

  /**
   * Refresh PO items after posting.
   */
  async refreshPoItems(poNumber) {
    return this.getPoItems(poNumber);
  },
};

// ─── Helpers ────────────────────────────────────────────────

function buildGRBody(stagingItem, poHeader) {
  return {
    PostingID: generateId(),
    PurchaseOrder: poHeader.PurchaseOrder,
    PurchaseOrderItem: stagingItem.PurchaseOrderItem,
    Material: stagingItem.Material,
    Plant: poHeader.Plant || stagingItem.Plant,
    StorageLocation: stagingItem.StorageLocation || '',
    Quantity: stagingItem.recptQty,
    EntryUnit: stagingItem.OrderUnit,
    MovementType: '101',
    PostingDate: stagingItem.postingDate || '',
  };
}

async function postBatch(stagingItems, poHeader, onProgress) {
  const bodies = stagingItems.map((item) => ({
    method: 'POST',
    body: buildGRBody(item, poHeader),
    contentId: item.PurchaseOrderItem,
  }));

  const batchResults = await odataBatch('GRPostings', bodies);
  const results = [];

  for (let i = 0; i < stagingItems.length; i++) {
    const br = batchResults[i];
    const body = bodies[i].body;
    let result;
    if (br && br.ok) {
      result = {
        success: true,
        postingId: body.PostingID,
        materialDocument: br.body?.MaterialDocument || '',
        materialDocumentYear: br.body?.MaterialDocumentYear || '',
      };
    } else {
      const errMsg =
        br?.body?.error?.message?.value ||
        br?.body?.error?.message ||
        `Batch part ${i + 1} failed (status ${br?.status || 'unknown'})`;
      result = {
        success: false,
        error: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg),
        postingId: body.PostingID,
      };
    }
    results.push(result);
    if (onProgress) onProgress(i + 1, stagingItems.length, result);
  }

  return results;
}

async function postSequential(stagingItems, poHeader, onProgress) {
  const results = [];
  for (let i = 0; i < stagingItems.length; i++) {
    const result = await EntityService.postGoodsReceipt(stagingItems[i], poHeader);
    results.push(result);
    if (onProgress) onProgress(i + 1, stagingItems.length, result);
  }
  return results;
}

function storeActions_cacheItems(poNumber, items) {
  store.cache.deliveryCache[poNumber] = { items, loaded: true };
}

function storeActions_addToPoHistory(po) {
  const entry = {
    PurchaseOrder: po.PurchaseOrder,
    SupplierName: po.SupplierName || '',
    Plant: po.Plant || '',
    timestamp: Date.now(),
  };
  const idx = store.cache.poHistory.findIndex(
    (h) => h.PurchaseOrder === entry.PurchaseOrder
  );
  if (idx >= 0) store.cache.poHistory.splice(idx, 1);
  store.cache.poHistory.unshift(entry);
  if (store.cache.poHistory.length > 5) {
    store.cache.poHistory.splice(5);
  }
}

// ─── Barcode Matching ─────────────────────────────────────

/**
 * Match a scanned barcode to a PO item by EAN.
 * Checks PrimaryEAN first, then CartonEAN.
 */
export function matchBarcode(barcode, items) {
  if (!barcode || !items) return null;
  const normalized = barcode.trim();

  let match = items.find((i) => i.PrimaryEAN && i.PrimaryEAN === normalized);
  if (match) return { item: match, unit: match.PrimaryEANUnit };

  match = items.find((i) => i.CartonEAN && i.CartonEAN === normalized);
  if (match) return { item: match, unit: match.CartonEANUnit };

  return null;
}
