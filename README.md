# TaskId Mapper

How does a zkVerify Agent Games gatekeeper taskId — a UUID string like
`task_R03_12345678-9abc-def0-1234-56789abcdef0` — become a circuit
field element? Paste a taskId and watch both mapping paths compute
live: the UUID substring read as a 128-bit integer, and the SHA-256
mod-p fallback. The page shows which path the gatekeeper takes and
why, plus all four branches in gatekeeper order.

Zero dependencies. Node.js built-ins only. No persistence: pasted ids
are processed in memory and never stored.

## Honest scope

- This tool demonstrates the mapping **one gatekeeper uses**. It
  generates no proofs, verifies nothing, and has no live platform
  data.
- The platform publishes no canonical taskId mapping. A different
  agent could encode taskIds differently; the platform judges each
  proof by its own verification. Nothing here is a platform
  guarantee.
- The evidence for this mapping is the gatekeeper's own history:
  tasks answered with SHA-256 of the full id string showed 0
  verified proofs, while the UUID-substring encoding produced
  verified proofs in competition rounds. That is round evidence for
  this encoding, not a proof that no other encoding works.
- Every bundled example uses a plainly fake UUID (patterns, zeros,
  max values, deadbeef filler). No real round task id appears
  anywhere in this demo.

## The mapping

Field: BN128 scalar field, prime
`p = 21888242871839275222246405745257275088548364400416034343698204186575808495617`
(about 2^254). Branches are tried in this order; the first that
applies wins:

| # | Branch | Rule | Reduction |
|---|---|---|---|
| 1 | `uuid-substring` | A UUID substring (8-4-4-4-12 hex with dashes) appears anywhere in the trimmed input: strip dashes, read the 32 hex digits as one 128-bit integer. | None — every 128-bit value is below p. |
| 2 | `bare-32-hex` | The whole input is exactly 32 hex digits once dashes are stripped: read as one 128-bit integer. | None, same reason. |
| 3 | `0x-hex-mod-p` | The input is a lowercase-`0x`-prefixed hex number: reduce mod p. | Mod p. |
| 4 | `sha256-mod-p` | Anything else: SHA-256 of the trimmed UTF-8 input, read as a 256-bit integer, reduced mod p. | Mod p. |

Why the UUID itself, not a hash? Platform ids carry a namespace
prefix plus a UUID (`task_R03_<uuid>`, `practice_<uuid>`). The
platform docs specify no hash for this mapping, so the natural
encoding is the UUID as an integer: the UUID is the task's identity
and the prefix is namespacing. The regex is deliberately
unanchored so it finds the UUID inside a prefixed id.

Reading decisions, documented rather than hidden:

- Branch order is fixed: a UUID substring anywhere wins over the
  `0x`-hex branch, even inside a `0x`-prefixed string. That is
  the gatekeeper's order, replicated here.
- Only a lowercase `0x` prefix is accepted by branch 3; `0X`
  falls through to the SHA-256 fallback. Same as the gatekeeper.
- A 32-hex-digit value reads the same with or without a `0x`
  prefix, because every 128-bit value is below p either way.
- Uppercase and lowercase hex give the same value; leading zeros
  change nothing. SHA-256, by contrast, hashes the exact trimmed
  bytes — case matters there.
- The mapping is deterministic: the same input always yields the
  same field element.

## API

- `GET /health` and `GET /api/health` → `{ok, service, version}`
- `GET /api/examples` → the bundled fake-UUID examples
- `GET /api/rules` → the branch rules, evidence note, and reading decisions
- `POST /api/map` with `{"taskId": "..."}` → all four branch
  evaluations, both paths side by side, and the chosen method with
  its reason. Non-empty string, max 256 chars, 64 KB body cap.

## Run

```
npm start        # listens on $PORT (default 3000)
npm test         # node --test, no dependencies
```

## Tests

37 tests, all passing. Expected values were computed independently
with Python (`hashlib` + integer arithmetic) and hardcoded — never
produced by calling the code under test. Coverage: every branch,
prefixed ids, uppercase hex, whitespace trimming, determinism,
empty/whitespace/oversized/non-string rejection, and HTTP-level
checks of every endpoint including the 413 body cap.
