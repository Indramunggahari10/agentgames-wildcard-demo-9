// TaskId Mapper — zero-framework HTTP server (Node built-ins only).
// No persistence, no external network calls, no logging of request
// bodies (only method, path, status, and coarse timing). Pasted task
// ids are processed in memory only.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  FIELD_PRIME,
  MAX_INPUT_CHARS,
  ValidationError,
  mapTaskId,
} from "./src/mapper.js";
import { EXAMPLES } from "./src/examples.js";

const MAX_BODY_BYTES = 64 * 1024;

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(ROOT, "public", "index.html");
const APP_JS_PATH = path.join(ROOT, "public", "app.js");

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

const RULES = {
  field: "BN128 scalar field",
  fieldPrime: FIELD_PRIME.toString(),
  inputCap: MAX_INPUT_CHARS,
  branches: [
    {
      order: 1,
      name: "uuid-substring",
      rule: "If a UUID substring (8-4-4-4-12 hex digits with dashes) appears anywhere in the trimmed input, strip its dashes and read the 32 hex digits as one 128-bit integer.",
      reduction: "None. 2^128 is below the field prime, so the value is already a valid field element.",
      why: "Platform ids carry a namespace prefix plus a UUID. The platform docs specify no hash for this mapping, so the natural encoding is the UUID itself as an integer — the UUID is the task's identity and the prefix is namespacing.",
    },
    {
      order: 2,
      name: "bare-32-hex",
      rule: "Otherwise, if the whole input is exactly 32 hex digits once dashes are stripped, read it as one 128-bit integer.",
      reduction: "None, for the same reason as above.",
      why: "Keeps the old behavior for ids supplied without dashes.",
    },
    {
      order: 3,
      name: "0x-hex-mod-p",
      rule: "Otherwise, if the input is a 0x-prefixed hex number, reduce it modulo the field prime.",
      reduction: "Modulo the field prime.",
      why: "A hex number of arbitrary size must be reduced to land inside the field.",
    },
    {
      order: 4,
      name: "sha256-mod-p",
      rule: "Otherwise, SHA-256 the trimmed input as UTF-8, read the 32-byte digest as a 256-bit integer, and reduce it modulo the field prime.",
      reduction: "Modulo the field prime.",
      why: "Fallback for anything without a UUID: any string maps deterministically to some field element.",
    },
  ],
  evidence:
    "This is the mapping the gatekeeper in this project uses. Its history: tasks answered with SHA-256 of the full id string showed 0 verified proofs, while the UUID-substring encoding produced verified proofs in competition rounds. The platform publishes no canonical mapping, so this demo shows one gatekeeper's encoding and its reasoning — not a platform guarantee.",
  notes: [
    "The mapping is deterministic: the same input always yields the same field element, on every run.",
    "The UUID path and the SHA-256 path give different values for the same input. Using the wrong one makes the proof bind to a different taskId than the platform expects.",
    "Leading zeros in a UUID change nothing: they are part of the 128-bit integer read.",
    "Uppercase and lowercase hex give the same value.",
    "Branch order is fixed and is the gatekeeper's: a UUID substring anywhere in the input wins over the 0x-hex branch, even inside a 0x-prefixed string.",
    "Only a lowercase 0x prefix is accepted by the hex branch; an input starting with 0X falls through to the SHA-256 fallback. This matches the gatekeeper.",
    "A 32-hex-digit value reads the same with or without a 0x prefix, because every 128-bit value is below the field prime either way.",
  ],
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": "application/json; charset=utf-8",
  });
  res.end(body);
}

// Reads the body with a hard cap. Oversized bodies are drained without
// accumulating (bounded memory) and reported as { overflow: true }.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let overflow = false;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        overflow = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () =>
      resolve({ overflow, text: Buffer.concat(chunks).toString("utf8") }),
    );
    req.on("error", reject);
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    try {
      const url = new URL(req.url, "http://localhost");
      if (
        req.method === "GET" &&
        (url.pathname === "/health" || url.pathname === "/api/health")
      ) {
        sendJson(res, 200, {
          ok: true,
          service: "taskid-mapper",
          version: "1.0.0",
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/") {
        const html = await readFile(INDEX_PATH, "utf8");
        res.writeHead(200, {
          ...SECURITY_HEADERS,
          "content-type": "text/html; charset=utf-8",
        });
        res.end(html);
        return;
      }
      if (req.method === "GET" && url.pathname === "/app.js") {
        const js = await readFile(APP_JS_PATH, "utf8");
        res.writeHead(200, {
          ...SECURITY_HEADERS,
          "content-type": "text/javascript; charset=utf-8",
        });
        res.end(js);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/examples") {
        sendJson(res, 200, { examples: EXAMPLES });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/rules") {
        sendJson(res, 200, { rules: RULES });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/map") {
        const { overflow, text } = await readBody(req);
        if (overflow) {
          sendJson(res, 413, { error: "body too large (64 KB cap)" });
          return;
        }
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          sendJson(res, 400, { error: "body must be valid JSON" });
          return;
        }
        try {
          sendJson(res, 200, mapTaskId(body && body.taskId));
        } catch (err) {
          if (err instanceof ValidationError) {
            sendJson(res, 400, { error: err.message, details: err.details });
          } else {
            throw err;
          }
        }
        return;
      }
      sendJson(res, 404, { error: "not found" });
    } catch (err) {
      if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      console.error("request failed", err.message);
    } finally {
      // Coarse access log only: no bodies, no pasted content.
      console.log(
        `${req.method} ${new URL(req.url, "http://localhost").pathname} -> ${res.statusCode} (${Date.now() - started}ms)`,
      );
    }
  });
}

// Default export: Vercel's Node.js runtime requires the server entrypoint's
// default export to be a function or a server. Exporting the created server
// lets Vercel route requests through it; running `node server.js` directly
// still listens on $PORT as before.
const server = createServer();
export default server;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => {
    console.log(`taskid-mapper listening on :${port}`);
  });
}
