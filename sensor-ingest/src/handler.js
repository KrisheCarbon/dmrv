const { Client } = require('pg');

const MAX_BODY_BYTES = 1_000_000;
const MAX_ID_LENGTH = 128;
const LIVE_WITHIN_MS = 30_000;
const MAX_READING_ROWS = 2000;

const SCHEMA = `
create table if not exists sensor_payloads (
  id uuid primary key default gen_random_uuid(),
  device_id text,
  idempotency_key text,
  received_at timestamptz not null default now(),
  payload jsonb not null
);
create unique index if not exists sensor_payloads_idempotency_key_idx
  on sensor_payloads (idempotency_key)
  where idempotency_key is not null;
`;

let client = null;
let schemaReady = null;

function header(headers, name) {
  if (!headers) return '';
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return Array.isArray(value) ? value[0] : String(value ?? '');
  }
  return '';
}

function bearer(headers) {
  const authorization = header(headers, 'authorization');
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
  if (match) return match[1];
  return header(headers, 'x-api-key').trim();
}

function keysMatch(given, expected) {
  if (!given || !expected || given.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < given.length; i += 1) {
    mismatch |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

function cleanId(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > MAX_ID_LENGTH) return null;
  if (/[^\x20-\x7E]/.test(text)) return null;
  return text;
}

function deviceIdFromTopic(topic) {
  const match = /^krishe\/sensors\/([^/]+)\/readings$/.exec(String(topic ?? ''));
  return match ? cleanId(match[1]) : null;
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function normalizeEvent(event) {
  const headers = event.headers || {};
  let raw = event.body ?? '';
  if (event.isBase64Encoded && raw) raw = Buffer.from(raw, 'base64').toString('utf8');
  const path = String(event.rawPath || event.path || '/').replace(/\/+$/, '') || '/';
  const method = String(
    event.requestContext?.http?.method || event.httpMethod || 'GET',
  ).toUpperCase();
  return { method, path, headers, raw };
}

async function database() {
  if (client) return client;
  const next = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    application_name: 'sensor-ingest',
  });
  next.on('error', () => {
    client = null;
    schemaReady = null;
  });
  await next.connect();
  client = next;
  return next;
}

async function ready(db) {
  if (!schemaReady) schemaReady = db.query(SCHEMA);
  try {
    await schemaReady;
  } catch (error) {
    schemaReady = null;
    throw error;
  }
}

async function storePayload(db, deviceId, idempotencyKey, payload) {
  await ready(db);
  const inserted = await db.query(
    `insert into sensor_payloads (device_id, idempotency_key, payload)
     values ($1, $2, $3::jsonb)
     on conflict (idempotency_key) where idempotency_key is not null do nothing
     returning id, received_at`,
    [deviceId, idempotencyKey, JSON.stringify(payload)],
  );
  if (inserted.rows[0]) {
    return { row: inserted.rows[0], duplicate: false };
  }
  const existing = await db.query(
    `select id, received_at from sensor_payloads where idempotency_key = $1`,
    [idempotencyKey],
  );
  return { row: existing.rows[0], duplicate: true };
}

async function recent(db) {
  await ready(db);
  const result = await db.query(
    `select id, device_id, received_at, payload
     from sensor_payloads
     order by received_at desc
     limit 5`,
  );
  return result.rows;
}

async function storeReading(db, deviceId, idempotencyKey, payload) {
  const connection = typeof db === 'function' ? await db() : db;
  try {
    const stored = await storePayload(connection, deviceId, idempotencyKey, payload);
    if (!stored.row) return response(500, { error: 'Could not store payload' });
    return response(200, {
      id: stored.row.id,
      received_at: stored.row.received_at,
      duplicate: stored.duplicate,
    });
  } catch (error) {
    client = null;
    schemaReady = null;
    console.error('sensor ingest store failed', error instanceof Error ? error.message : 'unknown');
    return response(500, { error: 'Could not store payload' });
  }
}

function mqttReading(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  if (event.requestContext || event.httpMethod || event.rawPath || event.path) return null;
  if (typeof event.krishe_mqtt_topic !== 'string') return null;
  const payload = { ...event };
  const topic = payload.krishe_mqtt_topic;
  delete payload.krishe_mqtt_topic;
  const idempotencyKey = cleanId(payload.idempotency_key);
  delete payload.idempotency_key;
  delete payload.api_key;
  delete payload.krishe_admin;
  return {
    deviceId: deviceIdFromTopic(topic) || cleanId(payload.sensor_id) || cleanId(payload.device_id),
    idempotencyKey,
    payload,
  };
}

function adminRequest(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  if (event.requestContext || event.httpMethod || event.rawPath || event.path) return null;
  if (event.krishe_admin !== true) return null;
  return event;
}

async function listSensors(db) {
  await ready(db);
  const summary = await db.query(
    `select device_id,
            count(*)::int as reading_count,
            min(received_at) as first_at,
            max(received_at) as last_at
     from sensor_payloads
     group by device_id
     order by max(received_at) desc`,
  );
  const latest = await db.query(
    `select distinct on (device_id) device_id, payload
     from sensor_payloads
     order by device_id, received_at desc`,
  );
  const latestByDevice = new Map(latest.rows.map((row) => [row.device_id, row.payload]));
  const now = Date.now();
  return summary.rows.map((row) => {
    const last = new Date(row.last_at).getTime();
    return {
      device_id: row.device_id,
      reading_count: Number(row.reading_count),
      first_at: row.first_at,
      last_at: row.last_at,
      live: Number.isFinite(last) && now - last <= LIVE_WITHIN_MS,
      latest_payload: latestByDevice.get(row.device_id) ?? null,
    };
  });
}

async function listReadings(db, deviceId, limit) {
  await ready(db);
  const total = await db.query(
    `select count(*)::int as n from sensor_payloads where device_id = $1`,
    [deviceId],
  );
  const readings = await db.query(
    `select id, device_id, idempotency_key, received_at, payload
     from (
       select id, device_id, idempotency_key, received_at, payload
       from sensor_payloads
       where device_id = $1
       order by received_at desc
       limit $2
     ) recent
     order by received_at asc`,
    [deviceId, limit],
  );
  return {
    device_id: deviceId,
    total: Number(total.rows[0]?.n ?? 0),
    readings: readings.rows,
  };
}

async function adminHandle(event, db) {
  const connection = typeof db === 'function' ? await db() : db;
  try {
    if (event.action === 'sensors') {
      return response(200, { sensors: await listSensors(connection), live_within_seconds: LIVE_WITHIN_MS / 1000 });
    }
    if (event.action === 'readings') {
      const deviceId = cleanId(event.deviceId);
      if (!deviceId) return response(400, { error: 'Sensor id is required' });
      const requested = Number(event.limit);
      const limit = Math.min(
        Math.max(Number.isFinite(requested) ? requested : MAX_READING_ROWS, 1),
        MAX_READING_ROWS,
      );
      return response(200, await listReadings(connection, deviceId, limit));
    }
    return response(400, { error: 'Unknown action' });
  } catch (error) {
    client = null;
    schemaReady = null;
    console.error('sensor ingest read failed', error instanceof Error ? error.message : 'unknown');
    return response(500, { error: 'Could not read payloads' });
  }
}

async function handle(event, db = database) {
  const fromMqtt = mqttReading(event);
  if (fromMqtt) {
    if (!fromMqtt.deviceId) return response(400, { error: 'Topic must be krishe/sensors/{sensor id}/readings' });
    const encoded = JSON.stringify(fromMqtt.payload);
    if (Buffer.byteLength(encoded) > MAX_BODY_BYTES) return response(413, { error: 'Payload too large' });
    return storeReading(db, fromMqtt.deviceId, fromMqtt.idempotencyKey, fromMqtt.payload);
  }

  const fromAdmin = adminRequest(event);
  if (fromAdmin) return adminHandle(fromAdmin, db);

  const { method, path, headers, raw } = normalizeEvent(event);
  if (method === 'GET' && path === '/health') return response(200, { ok: true });

  if (method === 'POST' && path === '/v1/readings' && Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return response(413, { error: 'Payload too large' });
  }

  let payload = null;
  if (method === 'POST' && path === '/v1/readings') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return response(400, { error: 'Body must be JSON' });
    }
    if (payload === null || typeof payload !== 'object') {
      return response(400, { error: 'Body must be a JSON object or array' });
    }
  }

  const embeddedKey = payload && !Array.isArray(payload) && typeof payload.api_key === 'string'
    ? payload.api_key
    : '';
  const presented = bearer(headers) || embeddedKey;
  const deviceKey = process.env.SENSOR_DEVICE_API_KEY || '';
  const adminKey = process.env.SENSOR_ADMIN_API_KEY || '';
  const isDevice = keysMatch(presented, deviceKey);
  const isAdmin = keysMatch(presented, adminKey);
  if (!isDevice && !isAdmin) return response(401, { error: 'Unauthorized' });

  if (method === 'GET' && path === '/v1/recent') {
    if (!isAdmin) return response(401, { error: 'Unauthorized' });
    const connection = typeof db === 'function' ? await db() : db;
    const rows = await recent(connection);
    return response(200, { readings: rows });
  }

  if (method !== 'POST' || path !== '/v1/readings') {
    return response(404, { error: 'Not found' });
  }
  if (!isDevice) return response(401, { error: 'Unauthorized' });
  if (!Array.isArray(payload) && Object.prototype.hasOwnProperty.call(payload, 'api_key')) {
    payload = { ...payload };
    delete payload.api_key;
  }

  const deviceId = cleanId(header(headers, 'x-device-id')) ||
    (!Array.isArray(payload) ? cleanId(payload.device_id) : null);
  const idempotencyKey = cleanId(header(headers, 'idempotency-key')) ||
    (!Array.isArray(payload) ? cleanId(payload.idempotency_key) : null);
  if (!Array.isArray(payload)) delete payload.idempotency_key;
  return storeReading(db, deviceId, idempotencyKey, payload);
}

module.exports = {
  handler: (event) => handle(event),
  handle,
  keysMatch,
  cleanId,
  deviceIdFromTopic,
};
