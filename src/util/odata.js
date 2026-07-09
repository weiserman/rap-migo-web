/**
 * OData client for ZUI_MIGO_GR_V4 via AHM broker proxy.
 * All requests go through /api/net/request to bypass CORS.
 */
import { store } from './store.js';

let cachedCsrfToken = null;
let stableSessionCookies = '';
const BROKER_URL = '/api/net/request';

/**
 * Execute a request through the AHM broker proxy.
 */
async function executeBrokerRequest(absoluteUrl, configOptions) {
  const normalizedHeaders = {
    Accept: configOptions.headers.get('Accept') || 'application/json',
  };

  if (configOptions.headers.has('Authorization')) {
    normalizedHeaders['Authorization'] = configOptions.headers.get('Authorization');
  }
  if (configOptions.headers.has('X-CSRF-Token')) {
    normalizedHeaders['X-CSRF-Token'] = configOptions.headers.get('X-CSRF-Token');
  }
  if (configOptions.headers.has('Content-Type')) {
    normalizedHeaders['Content-Type'] = configOptions.headers.get('Content-Type');
  }

  if (stableSessionCookies) {
    const cleanCookies = stableSessionCookies
      .split(',')
      .map((c) => c.split(';')[0].trim())
      .join('; ');
    normalizedHeaders['Cookie'] = cleanCookies;
  }

  const envelope = {
    timeout_ms: store.config.networkTimeoutMs || 15000,
    request: {
      url: absoluteUrl,
      method: (configOptions.method || 'GET').toUpperCase(),
      headers: normalizedHeaders,
    },
  };

  if (configOptions.body) {
    envelope.request.body =
      typeof configOptions.body === 'string'
        ? configOptions.body
        : JSON.stringify(configOptions.body);
  }

  const brokerResponse = await fetch(BROKER_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  });

  const resultWrapper = await brokerResponse.json();

  // Capture cookies from response
  if (resultWrapper.headers) {
    const lowerCaseHeaders = {};
    for (const [k, v] of Object.entries(resultWrapper.headers)) {
      lowerCaseHeaders[k.toLowerCase()] = v;
    }
    resultWrapper.headers = lowerCaseHeaders;

    if (lowerCaseHeaders['set-cookie']) {
      stableSessionCookies = lowerCaseHeaders['set-cookie'];
    }
  }

  return {
    status: resultWrapper.status,
    ok: resultWrapper.status >= 200 && resultWrapper.status < 300,
    headers: {
      get: (name) =>
        resultWrapper.headers ? resultWrapper.headers[name.toLowerCase()] : null,
    },
    json: async () => JSON.parse(resultWrapper.body),
    text: async () => resultWrapper.body,
  };
}

/**
 * Fetch a CSRF token from SAP.
 */
async function fetchSAPCsrfToken(referenceUrl) {
  const tokenUrl = referenceUrl || buildServiceUrl('PurchaseOrders?$top=1');
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  headers.set('X-CSRF-Token', 'Fetch');

  const { username, password } = store.config;
  if (username) {
    headers.set('Authorization', `Basic ${btoa(`${username}:${password || ''}`)}`);
  }

  try {
    const response = await executeBrokerRequest(tokenUrl, { method: 'GET', headers });
    if (response.ok) {
      const csrfValue = response.headers.get('x-csrf-token');
      if (csrfValue && csrfValue !== 'Fetch') {
        cachedCsrfToken = csrfValue;
        return csrfValue;
      }
    }
  } catch {
    // Token fetch failed — proceed without
  }
  return null;
}

/**
 * Build a full service URL for an entity path.
 */
function buildServiceUrl(entityPath) {
  const cleanBase = store.config.baseHost.endsWith('/')
    ? store.config.baseHost.slice(0, -1)
    : store.config.baseHost;
  const cleanPath = store.config.poPath.endsWith('/')
    ? store.config.poPath.slice(0, -1)
    : store.config.poPath;
  let url = `${cleanBase}${cleanPath}/${entityPath}`;
  // Auto-append $format=json
  if (!url.includes('$format')) {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}$format=json`;
  }
  return url;
}

/**
 * Main OData fetch function.
 * @param {string} entityPath - Entity path (e.g., "PurchaseOrders" or "PurchaseOrders('4500000001')/_Items")
 * @param {Object} options - { method, headers, body }
 * @returns {Promise<Object>} Parsed JSON
 */
export async function odataFetch(entityPath, options = {}) {
  const absoluteUrl = buildServiceUrl(entityPath);
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (options.method && options.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  const { username, password } = store.config;
  if (username) {
    headers.set('Authorization', `Basic ${btoa(`${username}:${password || ''}`)}`);
  }

  const isModifying =
    options.method && options.method !== 'GET' && options.method !== 'HEAD';

  if (isModifying) {
    if (!cachedCsrfToken) {
      await fetchSAPCsrfToken();
    }
    if (cachedCsrfToken) {
      headers.set('X-CSRF-Token', cachedCsrfToken);
    }
  }

  let response = await executeBrokerRequest(absoluteUrl, { ...options, headers });

  // Auto-retry on 403 (expired CSRF token)
  if (response.status === 403 && isModifying) {
    cachedCsrfToken = null;
    const freshToken = await fetchSAPCsrfToken();
    if (freshToken) {
      headers.set('X-CSRF-Token', freshToken);
      response = await executeBrokerRequest(absoluteUrl, { ...options, headers });
    }
  }

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body.error?.message?.value) {
        errorMessage = body.error.message.value;
      }
    } catch {
      // Use default error message
    }
    throw new Error(errorMessage);
  }

  return await response.json();
}

/**
 * Reset cached CSRF token (e.g., on config change).
 */
export function resetCsrfToken() {
  cachedCsrfToken = null;
  stableSessionCookies = '';
}
