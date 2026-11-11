const test = require('node:test');
const assert = require('node:assert/strict');
const { handle } = require('./handler');

function event(method, path, { key, body, headers = {} } = {}) {
  return {
    rawPath: path,
    requestContext: { http: { method } },
    headers: key ? { authorization: `Bearer ${key}`, ...headers } : headers,
    body: body === undefined ? '' : body,
  };
}

function memoryDb() {
  const rows = [];
  return {
    rows,
    async query(sql, params = []) {
      if (sql.includes('create table')) return { rows: [] };
      if (sql.startsWith('insert')) {
        const key = params[1];
        if (key && rows.some((row) => row.idempotency_key === key)) return { rows: [] };
        const row = {
          id: `id-${rows.length + 1}`,
          device_id: params[0],
          idempotency_key: key,
          received_at: '2026-11-10T09:00:00.000Z',
          payload: JSON.parse(params[2]),
        };
        rows.push(row);
        return { rows: [row] };
      }
      if (sql.includes('where idempotency_key')) {
        return { rows: rows.filter((row) => row.idempotency_key === params[0]) };
      }
      return { rows: rows.slice(-5).reverse() };
    },
  };
}

test('health does not require a key', async () => {
  const result = await handle(event('GET', '/health'), memoryDb());
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body), { ok: true });
});

test('a missing key is rejected', async () => {
  process.env.SENSOR_DEVICE_API_KEY = 'device-key';
  const result = await handle(event('POST', '/v1/readings', { body: '{}' }), memoryDb());
  assert.equal(result.statusCode, 401);
});

test('the device key stores the json and drops an embedded api key', async () => {
  process.env.SENSOR_DEVICE_API_KEY = 'device-key';
  process.env.SENSOR_ADMIN_API_KEY = 'admin-key';
  const db = memoryDb();
  const result = await handle(
    event('POST', '/v1/readings', {
      key: 'device-key',
      body: JSON.stringify({ api_key: 'device-key', temperature_c: 420, device_id: 'kiln-1' }),
      headers: { 'x-device-id': 'kiln-1', 'idempotency-key': 'batch-9' },
    }),
    db,
  );
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.duplicate, false);
  assert.equal(db.rows[0].device_id, 'kiln-1');
  assert.equal(db.rows[0].payload.temperature_c, 420);
  assert.equal(db.rows[0].payload.api_key, undefined);

  const again = await handle(
    event('POST', '/v1/readings', {
      key: 'device-key',
      body: JSON.stringify({ temperature_c: 420 }),
      headers: { 'idempotency-key': 'batch-9' },
    }),
    db,
  );
  assert.equal(JSON.parse(again.body).duplicate, true);
  assert.equal(db.rows.length, 1);
});

test('the device key cannot list stored readings', async () => {
  process.env.SENSOR_DEVICE_API_KEY = 'device-key';
  process.env.SENSOR_ADMIN_API_KEY = 'admin-key';
  const result = await handle(event('GET', '/v1/recent', { key: 'device-key' }), memoryDb());
  assert.equal(result.statusCode, 401);
});

test('a key inside the json is accepted and not stored', async () => {
  process.env.SENSOR_DEVICE_API_KEY = 'device-key';
  const db = memoryDb();
  const result = await handle(
    event('POST', '/v1/readings', {
      body: JSON.stringify({ api_key: 'device-key', humidity: 40 }),
    }),
    db,
  );
  assert.equal(result.statusCode, 200);
  assert.equal(db.rows[0].payload.api_key, undefined);
  assert.equal(db.rows[0].payload.humidity, 40);
});

test('an mqtt message stores their sensor id from the topic and keeps their values', async () => {
  const db = memoryDb();
  const result = await handle(
    {
      krishe_mqtt_topic: 'krishe/sensors/sensor-1/readings',
      sensor_id: 'sensor-1',
      recorded_at: '2026-11-10T12:00:00Z',
      temperature_c: 420,
      idempotency_key: 'sensor-1-2026-11-10T12:00:00Z',
    },
    db,
  );
  assert.equal(result.statusCode, 200);
  assert.equal(db.rows[0].device_id, 'sensor-1');
  assert.equal(db.rows[0].payload.temperature_c, 420);
  assert.equal(db.rows[0].payload.sensor_id, 'sensor-1');
  assert.equal(db.rows[0].payload.idempotency_key, undefined);
  assert.equal(db.rows[0].payload.krishe_mqtt_topic, undefined);
});

test('an admin read lists each sensor and its raw readings', async () => {
  const rows = [
    {
      id: 'a',
      device_id: 'sensor-1',
      idempotency_key: 'sensor-1-1',
      received_at: new Date(Date.now() - 5_000).toISOString(),
      payload: { d: { t1: '-500.0', t2: '640.0' } },
    },
    {
      id: 'b',
      device_id: 'sensor-2',
      idempotency_key: 'sensor-2-1',
      received_at: '2026-11-10T09:00:00.000Z',
      payload: { gps: [78.4, 17.48] },
    },
  ];
  const db = {
    async query(sql, params = []) {
      if (sql.includes('group by device_id')) {
        return {
          rows: ['sensor-1', 'sensor-2'].map((deviceId) => {
            const mine = rows.filter((row) => row.device_id === deviceId);
            return {
              device_id: deviceId,
              reading_count: mine.length,
              first_at: mine[0].received_at,
              last_at: mine[mine.length - 1].received_at,
            };
          }),
        };
      }
      if (sql.includes('distinct on')) {
        return { rows: rows.map((row) => ({ device_id: row.device_id, payload: row.payload })) };
      }
      if (sql.includes('count(*)')) {
        return { rows: [{ n: rows.filter((row) => row.device_id === params[0]).length }] };
      }
      return { rows: rows.filter((row) => row.device_id === params[0]) };
    },
  };

  const listed = await handle({ krishe_admin: true, action: 'sensors' }, db);
  const sensors = JSON.parse(listed.body).sensors;
  assert.equal(listed.statusCode, 200);
  assert.equal(sensors.find((sensor) => sensor.device_id === 'sensor-1').live, true);
  assert.equal(sensors.find((sensor) => sensor.device_id === 'sensor-2').live, false);
  assert.equal(sensors[0].latest_payload.d.t1, '-500.0');

  const detail = await handle({ krishe_admin: true, action: 'readings', deviceId: 'sensor-1' }, db);
  const body = JSON.parse(detail.body);
  assert.equal(body.total, 1);
  assert.equal(body.readings[0].id, 'a');
  assert.equal(body.readings[0].payload.d.t2, '640.0');
});

test('an mqtt message is not treated as an admin read', async () => {
  const db = memoryDb();
  const result = await handle(
    {
      krishe_mqtt_topic: 'krishe/sensors/sensor-1/readings',
      krishe_admin: true,
      action: 'sensors',
      sensor_id: 'sensor-1',
    },
    db,
  );
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).duplicate, false);
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].payload.krishe_admin, undefined);
});

test('invalid json is rejected', async () => {
  process.env.SENSOR_DEVICE_API_KEY = 'device-key';
  const result = await handle(
    event('POST', '/v1/readings', { key: 'device-key', body: 'not-json' }),
    memoryDb(),
  );
  assert.equal(result.statusCode, 400);
});
