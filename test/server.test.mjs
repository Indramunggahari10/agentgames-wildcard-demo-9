// Server tests: spin up the real server on an ephemeral port and hit
// it over HTTP. No mocks.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function postMap(body, raw) {
  return fetch(`${base}/api/map`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
}

test("GET /health returns ok", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.service, "taskid-mapper");
});

test("GET /api/health returns the same shape", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.service, "taskid-mapper");
});

test("GET / serves the UI", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  const html = await res.text();
  assert.match(html, /TaskId Mapper/);
  assert.match(html, /Honest scope/);
});

test("GET /app.js serves the client script", async () => {
  const res = await fetch(`${base}/app.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /javascript/);
});

test("GET /api/examples returns at least 5 bundled examples", async () => {
  const res = await fetch(`${base}/api/examples`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.examples));
  assert.ok(data.examples.length >= 5);
  for (const ex of data.examples) {
    assert.equal(typeof ex.taskId, "string");
    assert.equal(typeof ex.label, "string");
  }
});

test("GET /api/rules explains the four branches and the field prime", async () => {
  const res = await fetch(`${base}/api/rules`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.rules.fieldPrime.length > 70, true);
  assert.equal(data.rules.branches.length, 4);
  assert.deepEqual(
    data.rules.branches.map((b) => b.name),
    ["uuid-substring", "bare-32-hex", "0x-hex-mod-p", "sha256-mod-p"],
  );
});

test("POST /api/map maps a UUID and returns both paths", async () => {
  const res = await postMap({
    taskId: "task_R03_12345678-9abc-def0-1234-56789abcdef0",
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.chosen.method, "uuid-substring");
  assert.equal(data.chosen.value, "24197857203266734864793317670504947440");
  assert.equal(data.uuidPath.applicable, true);
  assert.equal(data.sha256Path.applicable, true);
  assert.notEqual(data.sha256Path.value, data.uuidPath.value);
});

test("POST /api/map falls back to SHA-256 for a non-UUID string", async () => {
  const res = await postMap({ taskId: "not-a-uuid-at-all" });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.chosen.method, "sha256-mod-p");
  assert.equal(
    data.chosen.value,
    "21588551094872350110049128578616688875367101351617631532387682911741753132127",
  );
});

test("POST /api/map rejects an empty taskId with 400", async () => {
  const res = await postMap({ taskId: "   " });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /must not be empty/);
});

test("POST /api/map rejects a missing taskId with 400", async () => {
  const res = await postMap({});
  assert.equal(res.status, 400);
});

test("POST /api/map rejects an oversized taskId with 400", async () => {
  const res = await postMap({ taskId: "a".repeat(257) });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /at most 256/);
});

test("POST /api/map rejects an oversized body with 413", async () => {
  const res = await postMap(null, "x".repeat(65 * 1024));
  assert.equal(res.status, 413);
});

test("POST /api/map rejects invalid JSON with 400", async () => {
  const res = await postMap(null, "{not json");
  assert.equal(res.status, 400);
});

test("unknown route returns 404 JSON", async () => {
  const res = await fetch(`${base}/nope`);
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.error, "not found");
});
