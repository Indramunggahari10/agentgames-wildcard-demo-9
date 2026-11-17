// Mapper tests. Expected values were computed INDEPENDENTLY with
// Python (int.from_bytes / hashlib + mod p), then hardcoded here —
// never produced by calling the code under test.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FIELD_PRIME,
  MAX_INPUT_CHARS,
  ValidationError,
  mapTaskId,
} from "../src/mapper.js";
import { EXAMPLES } from "../src/examples.js";

const P = "21888242871839275222246405745257275088548364400416034343698204186575808495617";

test("field prime matches the BN128 scalar field prime", () => {
  assert.equal(FIELD_PRIME.toString(), P);
});

test("smallest non-zero UUID maps to 1 (plain integer read, not a hash)", () => {
  const r = mapTaskId("00000000-0000-0000-0000-000000000001");
  assert.equal(r.chosen.method, "uuid-substring");
  assert.equal(r.chosen.value, "1");
  assert.equal(r.chosen.hex, "0x1");
  assert.equal(r.inField, true);
});

test("patterned UUID maps to the independently computed integer", () => {
  const r = mapTaskId("11111111-2222-3333-4444-555555555555");
  assert.equal(r.chosen.method, "uuid-substring");
  assert.equal(r.chosen.value, "22685491133344522328127039013544875349");
  assert.equal(r.chosen.hex, "0x11111111222233334444555555555555");
});

test("largest UUID maps to 2^128 - 1 and stays inside the field", () => {
  const r = mapTaskId("ffffffff-ffff-ffff-ffff-ffffffffffff");
  assert.equal(r.chosen.value, "340282366920938463463374607431768211455");
  assert.equal(BigInt(r.chosen.value) < FIELD_PRIME, true);
});

test("deadbeef UUID maps to the independently computed integer", () => {
  const r = mapTaskId("deadbeef-dead-beef-dead-beefdeadbeef");
  assert.equal(r.chosen.value, "295990755083049101712519384020072382191");
  assert.equal(r.chosen.hex, "0xdeadbeefdeadbeefdeadbeefdeadbeef");
});

test("uppercase UUID gives the same value as lowercase", () => {
  const lower = mapTaskId("deadbeef-dead-beef-dead-beefdeadbeef");
  const upper = mapTaskId("DEADBEEF-DEAD-BEEF-DEAD-BEEFDEADBEEF");
  assert.equal(upper.chosen.value, lower.chosen.value);
  assert.equal(upper.chosen.hex, lower.chosen.hex);
});

test("prefixed id: the UUID substring is found and the prefix is ignored", () => {
  const r = mapTaskId("task_R03_12345678-9abc-def0-1234-56789abcdef0");
  assert.equal(r.chosen.method, "uuid-substring");
  assert.equal(r.uuidPath.uuid, "12345678-9abc-def0-1234-56789abcdef0");
  assert.equal(r.chosen.value, "24197857203266734864793317670504947440");
  assert.equal(r.chosen.hex, "0x123456789abcdef0123456789abcdef0");
  // Same value as the bare UUID: the prefix contributes nothing.
  const bare = mapTaskId("12345678-9abc-def0-1234-56789abcdef0");
  assert.equal(bare.chosen.value, r.chosen.value);
});

test("practice-style prefixed id maps via the UUID substring", () => {
  const r = mapTaskId("practice_abcdef01-2345-6789-abcd-ef0123456789");
  assert.equal(r.chosen.method, "uuid-substring");
  assert.equal(r.chosen.value, "228367255721259569362527394270995113865");
});

test("surrounding whitespace is trimmed before mapping", () => {
  const r = mapTaskId("  00000000-0000-0000-0000-000000000001\n");
  assert.equal(r.chosen.value, "1");
  assert.equal(r.input, "00000000-0000-0000-0000-000000000001");
});

test("bare 32-hex input (no dashes) reads as one 128-bit integer", () => {
  const r = mapTaskId("0123456789abcdeffedcba9876543210");
  assert.equal(r.chosen.method, "bare-32-hex");
  assert.equal(r.chosen.value, "1512366075204170947332355369683137040");
});

test("0x-prefixed hex input is reduced mod p", () => {
  const r = mapTaskId(
    "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  );
  assert.equal(r.chosen.method, "0x-hex-mod-p");
  assert.equal(
    r.chosen.value,
    "6350874878119819312338956282401532410528162663560392320966563075034087161850",
  );
});

test("non-UUID string falls back to SHA-256 mod p (independently computed)", () => {
  const r = mapTaskId("not-a-uuid-at-all");
  assert.equal(r.chosen.method, "sha256-mod-p");
  assert.equal(
    r.sha256Path.digestHex,
    "601efe4bef59e37288f02b40773e41b7a7300f65f69af597f2b8360bc3cf8460",
  );
  assert.equal(
    r.chosen.value,
    "21588551094872350110049128578616688875367101351617631532387682911741753132127",
  );
});

test("SHA-256 fallback for 'hello' matches hashlib mod p", () => {
  const r = mapTaskId("hello");
  assert.equal(r.chosen.method, "sha256-mod-p");
  assert.equal(
    r.sha256Path.digestHex,
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
  assert.equal(
    r.chosen.value,
    "20329878786436204988385760252021328656300425018755239228739303522659023427620",
  );
});

test("prefixed id without a UUID still falls back to SHA-256", () => {
  const r = mapTaskId("task_R03_no-uuid-here");
  assert.equal(r.chosen.method, "sha256-mod-p");
  assert.equal(r.uuidPath.applicable, false);
  assert.equal(
    r.chosen.value,
    "15741795493788254422074400184938210562839644895094541201191969936533350330308",
  );
});

test("both paths are always computed, even when the UUID path wins", () => {
  const r = mapTaskId("11111111-2222-3333-4444-555555555555");
  assert.equal(r.uuidPath.applicable, true);
  assert.equal(r.sha256Path.applicable, true);
  assert.equal(r.sha256Path.name, "sha256-mod-p");
  assert.notEqual(r.sha256Path.value, r.uuidPath.value);
  assert.equal(r.branches.length, 4);
});

test("branch order is uuid, bare-32-hex, 0x-hex, sha256", () => {
  const r = mapTaskId("hello");
  assert.deepEqual(
    r.branches.map((b) => b.name),
    ["uuid-substring", "bare-32-hex", "0x-hex-mod-p", "sha256-mod-p"],
  );
});

test("determinism: same input twice gives identical output", () => {
  const a = mapTaskId("task_R03_12345678-9abc-def0-1234-56789abcdef0");
  const b = mapTaskId("task_R03_12345678-9abc-def0-1234-56789abcdef0");
  assert.deepEqual(a, b);
  const c = mapTaskId("not-a-uuid-at-all");
  const d = mapTaskId("not-a-uuid-at-all");
  assert.deepEqual(c, d);
});

test("every bundled example maps inside the field", () => {
  assert.ok(EXAMPLES.length >= 5, "at least 5 examples");
  for (const ex of EXAMPLES) {
    const r = mapTaskId(ex.taskId);
    assert.equal(r.inField, true, ex.id);
    assert.equal(BigInt(r.chosen.value) < FIELD_PRIME, true, ex.id);
  }
});

test("empty string is rejected", () => {
  assert.throws(() => mapTaskId(""), ValidationError);
  assert.throws(() => mapTaskId(""), /must not be empty/);
});

test("whitespace-only string is rejected", () => {
  assert.throws(() => mapTaskId("   \n\t "), ValidationError);
});

test("oversized input is rejected", () => {
  assert.throws(() => mapTaskId("a".repeat(MAX_INPUT_CHARS + 1)), ValidationError);
  assert.throws(
    () => mapTaskId("a".repeat(MAX_INPUT_CHARS + 1)),
    /at most 256/,
  );
});

test("input at exactly the cap is accepted", () => {
  const r = mapTaskId("a".repeat(MAX_INPUT_CHARS));
  assert.equal(r.chosen.method, "sha256-mod-p");
});

test("non-string input is rejected", () => {
  for (const bad of [null, undefined, 42, {}, [], true]) {
    assert.throws(() => mapTaskId(bad), ValidationError);
  }
});
