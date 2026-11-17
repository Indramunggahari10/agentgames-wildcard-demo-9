// TaskId Mapper UI. All computation happens server-side via /api/map;
// this file only renders results and example chips.
"use strict";

const $ = (id) => document.getElementById(id);
const input = $("taskId");
const chipsEl = $("chips");
const errorEl = $("error");

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function numBlock(label, value) {
  return `<div class="num"><span class="lbl">${esc(label)}</span>${esc(value)}</div>`;
}

function render(result) {
  errorEl.innerHTML = "";
  const uuid = result.uuidPath;
  const sha = result.sha256Path;
  const chosen = result.chosen;

  // Path A card.
  const uuidCard = $("uuidCard");
  const uuidBadge = $("uuidBadge");
  if (uuid.applicable) {
    uuidCard.classList.toggle("winner", chosen.method === "uuid-substring");
    uuidBadge.textContent =
      chosen.method === "uuid-substring" ? "Chosen" : "Applicable";
    uuidBadge.className =
      "badge" + (chosen.method === "uuid-substring" ? " win" : "");
    $("uuidBody").innerHTML =
      `<p>UUID found in the input: <code>${esc(uuid.uuid)}</code></p>` +
      `<p class="muted">Strip the dashes, read the 32 hex digits as one 128-bit integer. No reduction: 2<sup>128</sup> &lt; p.</p>` +
      numBlock("hex digits", uuid.hexDigits) +
      numBlock("field element (decimal)", uuid.value) +
      numBlock("field element (hex)", uuid.hex);
  } else {
    uuidCard.classList.remove("winner");
    uuidBadge.textContent = "Not applicable";
    uuidBadge.className = "badge na";
    $("uuidBody").innerHTML = `<p class="muted">${esc(uuid.reason)}</p>`;
  }

  // Path B card.
  const shaCard = $("shaCard");
  const shaBadge = $("shaBadge");
  shaCard.classList.toggle("winner", chosen.method === "sha256-mod-p");
  shaBadge.textContent =
    chosen.method === "sha256-mod-p" ? "Chosen (fallback)" : "Computed";
  shaBadge.className =
    "badge" + (chosen.method === "sha256-mod-p" ? " win" : "");
  $("shaBody").innerHTML =
    `<p class="muted">SHA-256 of the trimmed input (UTF-8), read as a 256-bit integer, reduced mod p.</p>` +
    numBlock("SHA-256 digest (hex)", sha.digestHex) +
    numBlock("digest as integer (decimal)", sha.digestDecimal) +
    numBlock("field element = digest mod p (decimal)", sha.value) +
    numBlock("field element (hex)", sha.hex);

  // Chosen card.
  $("chosenCard").innerHTML =
    `<p><strong>Chosen method: <code>${esc(chosen.method)}</code></strong></p>` +
    numBlock("field element (decimal)", chosen.value) +
    numBlock("field element (hex)", chosen.hex) +
    `<p>${esc(chosen.reason)}</p>` +
    `<p class="muted">Inside the field: ${result.inField ? "yes" : "no"} (value &lt; p). ` +
    `Same input always gives the same value — the mapping is deterministic.</p>`;

  // Branch table.
  $("branchRows").innerHTML = result.branches
    .map(
      (b, i) =>
        `<tr><td>${i + 1}</td><td><code>${esc(b.name)}</code></td>` +
        `<td>${b.applicable ? "Yes" : "No"}</td><td>${esc(b.reason)}</td></tr>`,
    )
    .join("");

  $("prime").textContent = result.fieldPrime;
}

function renderError(message) {
  errorEl.innerHTML = `<div class="error">${esc(message)}</div>`;
}

let timer = null;
let seq = 0;
async function mapCurrent() {
  const value = input.value;
  if (value.trim() === "") {
    errorEl.innerHTML = "";
    return;
  }
  const mine = ++seq;
  try {
    const res = await fetch("/api/map", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: value }),
    });
    const data = await res.json();
    if (mine !== seq) return; // a newer keystroke already fired
    if (!res.ok) {
      renderError(data.error || "Mapping failed.");
      return;
    }
    render(data);
  } catch {
    if (mine === seq) renderError("Could not reach the mapping API.");
  }
}

input.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(mapCurrent, 250);
});

async function loadExamples() {
  try {
    const res = await fetch("/api/examples");
    const data = await res.json();
    for (const ex of data.examples) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = ex.label;
      btn.title = ex.taskId + " — " + ex.note;
      btn.addEventListener("click", () => {
        input.value = ex.taskId;
        mapCurrent();
      });
      chipsEl.appendChild(btn);
    }
    // Show the prefixed example on load: it is the real input shape.
    const first = data.examples.find((e) => e.id === "prefixed") || data.examples[0];
    if (first) {
      input.value = first.taskId;
      mapCurrent();
    }
  } catch {
    chipsEl.innerHTML = `<span class="muted">Examples unavailable.</span>`;
  }
}

async function loadRules() {
  try {
    const res = await fetch("/api/rules");
    const data = await res.json();
    const r = data.rules;
    $("rules").innerHTML =
      `<ol>` +
      r.branches
        .map(
          (b) =>
            `<li><strong><code>${esc(b.name)}</code>.</strong> ${esc(b.rule)} ` +
            `<em>Reduction: ${esc(b.reduction)}</em> ${esc(b.why)}</li>`,
        )
        .join("") +
      `</ol><p>${esc(r.evidence)}</p><ul>` +
      r.notes.map((n) => `<li>${esc(n)}</li>`).join("") +
      `</ul>`;
  } catch {
    $("rules").innerHTML = `<p class="muted">Rules unavailable.</p>`;
  }
}

loadExamples();
loadRules();
