/**
 * Entity normalizers and service layer for ZUI_MIGO_GR_V4.
 * Maps SAP CDS entity fields to frontend-friendly objects.
 */
import { odataFetch } from './odata.js';
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
   * Post a single GR item via direct CREATE.
   */
  async postGoodsReceipt(stagingItem, poHeader) {
    const body = {
      PostingID: crypto.randomUUID().replace(/-/g, ''),
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

    try {
      await odataFetch('GRPostings', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return { success: true, postingId: body.PostingID };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        postingId: body.PostingID,
      };
    }
  },

  /**
   * Post multiple GR items sequentially.
   */
  async postGoodsReceipts(stagingItems, poHeader, onProgress) {
    const results = [];
    let successCount = 0;
    let failCount = 0;

    store.cache.postingInProgress = true;

    for (let i = 0; i < stagingItems.length; i++) {
      const result = await this.postGoodsReceipt(stagingItems[i], poHeader);
      results.push(result);
      if (result.success) successCount++;
      else failCount++;

      if (onProgress) onProgress(i + 1, stagingItems.length, result);
    }

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

// Helper to avoid circular import
function storeActions_cacheItems(poNumber, items) {
  store.cache.deliveryCache[poNumber] = { items, loaded: true };
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
