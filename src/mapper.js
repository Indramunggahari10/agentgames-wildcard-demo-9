// TaskId Mapper — the exact taskId -> field-element mapping the
// zkVerify Agent Games gatekeeper uses, isolated as a demonstration.
// Faithful port of taskIdToField() from the gatekeeper prover: the
// branch order, the UUID regex, and the SHA-256 fallback are the same.
// This module maps strings only. It generates no proofs, verifies
// nothing, and holds no live platform data.
import { createHash } from "node:crypto";

// BN128 scalar field prime (the circuit's field).
export const FIELD_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Task ids are short ("task_R03_<uuid>" is ~45 chars). Anything longer
// than this is not a task id; reject it rather than hash arbitrary input.
export const MAX_INPUT_CHARS = 256;

// Unanchored on purpose, exactly like the gatekeeper: platform ids carry
// a namespace prefix plus a UUID ("task_R03_<uuid>", "practice_<uuid>"),
// and the UUID inside the string is the task's identity.
const UUID_RE =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

export class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

function hexOf(value) {
  return "0x" + value.toString(16);
}

// The SHA-256 fallback, computed for every input so the UI can always
// show both paths side by side — even when the UUID path wins.
function sha256Fallback(trimmed) {
  const digest = createHash("sha256").update(trimmed, "utf8").digest();
  const digestHex = digest.toString("hex");
  const digestValue = BigInt("0x" + digestHex);
  return {
    digestHex,
    digestDecimal: digestValue.toString(),
    value: (digestValue % FIELD_PRIME).toString(),
    hex: hexOf(digestValue % FIELD_PRIME),
  };
}

export function mapTaskId(taskId) {
  if (typeof taskId !== "string") {
    throw new ValidationError("taskId must be a string", {
      received: taskId === null ? "null" : typeof taskId,
    });
  }
  const trimmed = taskId.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("taskId must not be empty");
  }
  if (trimmed.length > MAX_INPUT_CHARS) {
    throw new ValidationError(
      `taskId must be at most ${MAX_INPUT_CHARS} characters`,
      { length: trimmed.length },
    );
  }

  const branches = [];

  // Branch 1: a UUID substring anywhere in the string. Dashes are
  // stripped and the 32 hex digits are read as one 128-bit integer.
  // 2^128 < FIELD_PRIME, so no modular reduction is needed or applied.
  const uuidMatch = trimmed.match(UUID_RE);
  let uuidBranch = null;
  if (uuidMatch) {
    const uuid = uuidMatch[0];
    const value = BigInt("0x" + uuid.replace(/-/g, ""));
    uuidBranch = {
      name: "uuid-substring",
      applicable: true,
      uuid,
      hexDigits: uuid.replace(/-/g, ""),
      value: value.toString(),
      hex: hexOf(value),
      reason:
        "A UUID substring was found; its 32 hex digits read as one 128-bit integer. The surrounding prefix is namespacing and is ignored.",
    };
  } else {
    uuidBranch = {
      name: "uuid-substring",
      applicable: false,
      reason: "No UUID substring (8-4-4-4-12 hex with dashes) appears in the input.",
    };
  }
  branches.push(uuidBranch);

  // Branch 2: the whole input, dashes stripped, is exactly 32 hex chars.
  const dashless = trimmed.replace(/-/g, "");
  let bareBranch = null;
  if (/^[0-9a-fA-F]{32}$/.test(dashless)) {
    const value = BigInt("0x" + dashless);
    bareBranch = {
      name: "bare-32-hex",
      applicable: true,
      hexDigits: dashless,
      value: value.toString(),
      hex: hexOf(value),
      reason:
        "No UUID substring, but the input is exactly 32 hex digits once dashes are stripped, so it reads as one 128-bit integer.",
    };
  } else {
    bareBranch = {
      name: "bare-32-hex",
      applicable: false,
      reason: "The input is not exactly 32 hex digits once dashes are stripped.",
    };
  }
  branches.push(bareBranch);

  // Branch 3: a 0x-prefixed hex string, reduced mod p.
  let hexBranch = null;
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    const value = BigInt(trimmed) % FIELD_PRIME;
    hexBranch = {
      name: "0x-hex-mod-p",
      applicable: true,
      value: value.toString(),
      hex: hexOf(value),
      reason:
        "The input is a 0x-prefixed hex number; it is reduced modulo the field prime so the result is a valid field element.",
    };
  } else {
    hexBranch = {
      name: "0x-hex-mod-p",
      applicable: false,
      reason: "The input is not a 0x-prefixed hex number.",
    };
  }
  branches.push(hexBranch);

  // Branch 4: SHA-256 fallback. Always applicable, always computed.
  const fallback = sha256Fallback(trimmed);
  branches.push({
    name: "sha256-mod-p",
    applicable: true,
    digestHex: fallback.digestHex,
    digestDecimal: fallback.digestDecimal,
    value: fallback.value,
    hex: fallback.hex,
    reason:
      "Fallback for anything without a UUID: SHA-256 of the trimmed UTF-8 string, read as a 256-bit integer, reduced modulo the field prime.",
  });

  const chosenBranch = branches.find((b) => b.applicable);
  const chosen = {
    method: chosenBranch.name,
    value: chosenBranch.value,
    hex: chosenBranch.hex,
    reason: chosenBranch.reason,
  };

  return {
    input: trimmed,
    fieldPrime: FIELD_PRIME.toString(),
    branches,
    chosen,
    // The two paths the UI compares side by side.
    uuidPath: uuidBranch,
    sha256Path: branches[3],
    inField: BigInt(chosen.value) < FIELD_PRIME,
  };
}
