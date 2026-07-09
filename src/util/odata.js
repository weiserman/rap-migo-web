/**
 * OData client for ZUI_MIGO_GR_V4 via AHM broker proxy.
 * All requests go through /api/net/request to bypass CORS.
 */
import { store } from './store.js';

let cachedCsrfToken = null;
let stableSessionCookies = '';
const BROKER_URL = '/api/net/request';

/**
 * Build a detailed OData error with all available diagnostic information.
 */
function buildODataError({ method, url, status, statusText, body, phase, cause }) {
  const parts = [];

  // Phase indicator (where the failure occurred)
  if (phase) parts.push(`[${phase}]`);

  // HTTP status
  if (status !== undefined && status !== null) {
    parts.push(`${method || 'GET'} ${status}${statusText ? ' ' + statusText : ''}`);
  }

  // URL (truncated for display)
  if (url) {
    const shortUrl = url.length > 120 ? url.substring(0, 117) + '...' : url;
    parts.push(shortUrl);
  }

  // Error message from response body
  if (body) {
    try {
      const parsed = JSON.parse(body);
      // OData V4 error format
      if (parsed.error) {
        const msg = parsed.error.message;
        if (msg?.value) {
          parts.push(`— ${msg.value}`);
        } else if (typeof msg === 'string') {
          parts.push(`— ${msg}`);
        } else if (msg) {
          parts.push(`— ${JSON.stringify(msg)}`);
        }
        // Include error code if present
        if (parsed.error.code) {
          parts.push(`(code: ${parsed.error.code})`);
        }
      } else {
        // Non-OData error body
        const truncated = body.length > 300 ? body.substring(0, 300) + '...' : body;
        parts.push(`— ${truncated}`);
      }
    } catch {
      // Not JSON — show raw text
      const truncated = body.length > 300 ? body.substring(0, 300) + '...' : body;
      if (truncated) parts.push(`— ${truncated}`);
    }
  }

  // Underlying cause
  if (cause) {
    parts.push(`(cause: ${cause})`);
  }

  return parts.join(' ');
}

/**
 * Execute a request through the AHM broker proxy.
 * Returns a normalized response object with diagnostic info.
 */
async function executeBrokerRequest(absoluteUrl, configOptions) {
  const method = (configOptions.method || 'GET').toUpperCase();

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
      method: method,
      headers: normalizedHeaders,
    },
  };

  if (configOptions.body) {
    envelope.request.body =
      typeof configOptions.body === 'string'
        ? configOptions.body
        : JSON.stringify(configOptions.body);
  }

  // Phase 1: Broker fetch (network-level)
  let brokerResponse;
  try {
    brokerResponse = await fetch(BROKER_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });
  } catch (err) {
    throw new Error(
      buildODataError({
        method,
        url: absoluteUrl,
        phase: 'Network',
        cause: `Broker proxy unreachable (${err.message}). Is the AHM framework loaded?`,
      })
    );
  }

  // Phase 2: Parse broker response
  let resultWrapper;
  try {
    resultWrapper = await brokerResponse.json();
  } catch (err) {
    const rawText = await brokerResponse.text().catch(() => '');
    throw new Error(
      buildODataError({
        method,
        url: absoluteUrl,
        status: brokerResponse.status,
        phase: 'Broker',
        body: rawText,
        cause: `Broker returned non-JSON response (${err.message})`,
      })
    );
  }

  // Check if broker itself returned an error (distinct from SAP error)
  if (resultWrapper.error && !resultWrapper.status) {
    throw new Error(
      buildODataError({
        method,
        url: absoluteUrl,
        phase: 'Broker',
        body: typeof resultWrapper.error === 'string'
          ? resultWrapper.error
          : JSON.stringify(resultWrapper.error),
      })
    );
  }

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

  const status = resultWrapper.status || 0;
  const bodyText = resultWrapper.body || '';

  return {
    status,
    ok: status >= 200 && status < 300,
    method,
    url: absoluteUrl,
    headers: {
      get: (name) =>
        resultWrapper.headers ? resultWrapper.headers[name.toLowerCase()] : null,
    },
    json: async () => {
      try {
        return JSON.parse(bodyText || '{}');
      } catch {
        return { error: { message: 'Invalid JSON in response body' } };
      }
    },
    text: async () => bodyText,
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
  if (!store.config.baseHost) throw new Error('SAP Host not configured');
  if (!store.config.poPath) throw new Error('Service Path not configured');
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
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('Content-Type', 'application/json');
  }

  const { username, password } = store.config;
  if (username) {
    headers.set('Authorization', `Basic ${btoa(`${username}:${password || ''}`)}`);
  }

  const isModifying = method !== 'GET' && method !== 'HEAD';

  if (isModifying) {
    if (!cachedCsrfToken) {
      await fetchSAPCsrfToken();
    }
    if (cachedCsrfToken) {
      headers.set('X-CSRF-Token', cachedCsrfToken);
    }
  }

  let response = await executeBrokerRequest(absoluteUrl, { ...options, headers, method });

  // Auto-retry on 403 (expired CSRF token)
  if (response.status === 403 && isModifying) {
    cachedCsrfToken = null;
    const freshToken = await fetchSAPCsrfToken();
    if (freshToken) {
      headers.set('X-CSRF-Token', freshToken);
      response = await executeBrokerRequest(absoluteUrl, { ...options, headers, method });
    }
  }

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(
      buildODataError({
        method,
        url: absoluteUrl,
        status: response.status,
        body: bodyText,
        phase: 'SAP',
      })
    );
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
