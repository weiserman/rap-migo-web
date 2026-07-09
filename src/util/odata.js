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
 * Produces a multi-line diagnostic string that includes every available
 * piece of information from the failed request.
 */
function buildODataError(info) {
  const { method, url, status, body, phase, cause, brokerStatus } = info;
  const lines = [];

  // Line 1: Phase + method + status
  let line1 = `[${phase || 'Unknown'}]`;
  if (method) line1 += ` ${method}`;
  if (status !== undefined && status !== null && status !== 0) {
    line1 += ` ${status}`;
  } else if (brokerStatus !== undefined && brokerStatus !== null) {
    line1 += ` (broker HTTP ${brokerStatus})`;
  } else {
    line1 += ` (no response)`;
  }
  lines.push(line1);

  // Line 2: URL
  if (url) {
    lines.push(url);
  }

  // Line 3+: Body diagnostics
  if (body) {
    try {
      const parsed = JSON.parse(body);
      // OData V4 error format
      if (parsed.error) {
        const msg = parsed.error.message;
        if (msg?.value) {
          lines.push(msg.value);
        } else if (typeof msg === 'string') {
          lines.push(msg);
        } else if (msg) {
          lines.push(JSON.stringify(msg));
        }
        if (parsed.error.code) {
          lines.push(`Error code: ${parsed.error.code}`);
        }
        // Include details array if present (common in SAP RAP)
        if (parsed.error.details && Array.isArray(parsed.error.details)) {
          for (const detail of parsed.error.details.slice(0, 3)) {
            lines.push(`  • ${detail.message || JSON.stringify(detail)}`);
          }
        }
      } else {
        // Non-OData body
        const truncated = body.length > 500 ? body.substring(0, 500) + '...' : body;
        lines.push(truncated);
      }
    } catch {
      // Not JSON — show raw text
      const truncated = body.length > 500 ? body.substring(0, 500) + '...' : body;
      lines.push(truncated);
    }
  } else if (!cause) {
    lines.push('(empty response body)');
  }

  // Underlying cause
  if (cause) {
    lines.push(`Cause: ${cause}`);
  }

  return lines.join('\n');
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
        cause: `Broker proxy unreachable at ${BROKER_URL} — ${err.message}. Is the AHM framework loaded?`,
      })
    );
  }

  // Phase 2: Check broker HTTP status FIRST (matches reference scanner pattern)
  if (!brokerResponse.ok) {
    let brokerBody = '';
    try { brokerBody = await brokerResponse.text(); } catch {}

    // Build a diagnostic cause message with the target SAP URL
    const targetHost = store.config.baseHost || '(not set)';
    const causeParts = [
      `NetController failed to proxy ${method} request to SAP server.`,
      `Target: ${targetHost}`,
    ];

    // Check for common broker 500 causes in response body
    if (brokerBody) {
      const bodyLower = brokerBody.toLowerCase();
      if (bodyLower.includes('ssl') || bodyLower.includes('certificate') || bodyLower.includes('handshake')) {
        causeParts.push('Likely cause: SSL/TLS certificate validation failure. Check if SAP server uses self-signed certs.');
      } else if (bodyLower.includes('timeout') || bodyLower.includes('timed out')) {
        causeParts.push(`Likely cause: Network timeout (current: ${store.config.networkTimeoutMs || 15000}ms). SAP server did not respond.`);
      } else if (bodyLower.includes('dns') || bodyLower.includes('resolve') || bodyLower.includes('unknownhost')) {
        causeParts.push(`Likely cause: DNS resolution failure. Device cannot resolve hostname: ${targetHost}`);
      } else if (bodyLower.includes('connect') && bodyLower.includes('refused')) {
        causeParts.push(`Likely cause: Connection refused. Check SAP server URL and port.`);
      }
    }

    throw new Error(
      buildODataError({
        method,
        url: absoluteUrl,
        status: brokerResponse.status,
        body: brokerBody,
        phase: 'Broker',
        cause: causeParts.join('\n'),
      })
    );
  }

  // Phase 3: Parse broker JSON response wrapper
  let resultWrapper;
  try {
    resultWrapper = await brokerResponse.json();
  } catch (err) {
    throw new Error(
      buildODataError({
        method,
        url: absoluteUrl,
        status: brokerResponse.status,
        phase: 'Broker',
        cause: `Broker returned non-JSON response: ${err.message}`,
      })
    );
  }

  // Check if broker wrapper itself reported an error (no status field = broker-level failure)
  if (resultWrapper.error && !resultWrapper.status) {
    throw new Error(
      buildODataError({
        method,
        url: absoluteUrl,
        phase: 'Broker',
        body: typeof resultWrapper.error === 'string'
          ? resultWrapper.error
          : JSON.stringify(resultWrapper.error),
        cause: 'Broker wrapper reported an error while processing the request',
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

  // Extract status — handle numeric, string-number, and falsy values
  let status = 0;
  if (typeof resultWrapper.status === 'number') {
    status = resultWrapper.status;
  } else if (typeof resultWrapper.status === 'string') {
    status = parseInt(resultWrapper.status, 10) || 0;
  }

  const bodyText = resultWrapper.body || '';

  return {
    status,
    ok: status >= 200 && status < 300,
    method,
    url: absoluteUrl,
    bodyText,
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
    // Use the pre-captured bodyText from the response object
    const bodyText = response.bodyText || await response.text();
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
 * Send an OData $batch request with multiple operations.
 * Falls back gracefully if the broker or SAP doesn't support multipart.
 *
 * @param {string} entityPath - Base entity path (e.g., "GRPostings")
 * @param {Array<{method: string, body: object, contentId?: string}>} requests
 * @returns {Promise<Array<{status: number, body: object, ok: boolean}>>}
 */
export async function odataBatch(entityPath, requests) {
  if (!requests || requests.length === 0) return [];

  const boundary = 'batch_' + crypto.randomUUID().replace(/-/g, '');
  const batchUrl = buildServiceUrl('$batch');
  const serviceBase = buildServiceUrl(entityPath).split('?')[0]; // strip $format=json

  // Build multipart body
  const parts = [];
  requests.forEach((req, idx) => {
    const contentId = req.contentId || String(idx + 1);
    const partBody = JSON.stringify(req.body);
    parts.push(
      `--${boundary}\r\n` +
      `Content-Type: application/http\r\n` +
      `Content-Transfer-Encoding: binary\r\n` +
      `Content-ID: ${contentId}\r\n\r\n` +
      `POST ${serviceBase} HTTP/1.1\r\n` +
      `Content-Type: application/json\r\n` +
      `Accept: application/json\r\n\r\n` +
      `${partBody}\r\n`
    );
  });
  const multipartBody = parts.join('') + `--${boundary}--\r\n`;

  // Ensure CSRF token
  if (!cachedCsrfToken) {
    await fetchSAPCsrfToken();
  }

  const headers = new Headers();
  headers.set('Accept', 'multipart/mixed');
  headers.set('Content-Type', `multipart/mixed; boundary=${boundary}`);
  const { username, password } = store.config;
  if (username) {
    headers.set('Authorization', `Basic ${btoa(`${username}:${password || ''}`)}`);
  }
  if (cachedCsrfToken) {
    headers.set('X-CSRF-Token', cachedCsrfToken);
  }

  const response = await executeBrokerRequest(batchUrl, {
    method: 'POST',
    headers,
    body: multipartBody,
  });

  if (response.status === 403) {
    cachedCsrfToken = null;
    const freshToken = await fetchSAPCsrfToken();
    if (freshToken) headers.set('X-CSRF-Token', freshToken);
    const retry = await executeBrokerRequest(batchUrl, {
      method: 'POST',
      headers,
      body: multipartBody,
    });
    return parseBatchResponse(retry);
  }

  return parseBatchResponse(response);
}

/**
 * Parse a multipart/mixed $batch response into individual results.
 */
function parseBatchResponse(response) {
  if (!response.ok) {
    const bodyText = response.bodyText || '';
    throw new Error(
      buildODataError({
        method: 'POST',
        url: response.url,
        status: response.status,
        body: bodyText,
        phase: 'SAP',
      })
    );
  }

  const bodyText = response.bodyText || '';
  const contentType = response.headers.get('content-type') || '';

  // Extract boundary from Content-Type header
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
  if (!boundaryMatch) {
    throw new Error('Batch response missing multipart boundary');
  }

  const boundary = boundaryMatch[1];
  const results = [];

  // Split by boundary
  const parts = bodyText.split(`--${boundary}`);
  for (const part of parts) {
    if (!part || part.trim() === '--' || part.trim() === '') continue;

    // Extract HTTP status line
    const statusMatch = part.match(/HTTP\/1\.1\s+(\d+)/);
    if (!statusMatch) continue;

    const status = parseInt(statusMatch[1], 10);

    // Extract JSON body (after double CRLF)
    const bodyStart = part.indexOf('\r\n\r\n', part.indexOf('HTTP/1.1'));
    let parsedBody = {};
    if (bodyStart >= 0) {
      const jsonStr = part.substring(bodyStart + 4).trim();
      // Remove trailing boundary markers
      const cleanJson = jsonStr.replace(/\r\n$/, '').trim();
      if (cleanJson) {
        try {
          parsedBody = JSON.parse(cleanJson);
        } catch {
          parsedBody = { raw: cleanJson };
        }
      }
    }

    results.push({
      status,
      ok: status >= 200 && status < 300,
      body: parsedBody,
    });
  }

  return results;
}

/**
 * Reset cached CSRF token (e.g., on config change).
 */
export function resetCsrfToken() {
  cachedCsrfToken = null;
  stableSessionCookies = '';
}
