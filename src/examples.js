// Bundled examples. Every UUID here is plainly fake (patterns, zeros,
// max values, or the classic deadbeef filler). No real round task id
// appears anywhere in this demo.
export const EXAMPLES = [
  {
    id: "patterned",
    label: "Patterned UUID",
    taskId: "11111111-2222-3333-4444-555555555555",
    note: "A textbook UUID shape. The UUID path wins; the prefix-free form maps directly.",
  },
  {
    id: "prefixed",
    label: "Prefixed platform-style id",
    taskId: "task_R03_12345678-9abc-def0-1234-56789abcdef0",
    note: "The gatekeeper's real input shape: namespace prefix plus UUID. The substring rule finds the UUID and ignores the prefix.",
  },
  {
    id: "practice",
    label: "Practice-style id",
    taskId: "practice_abcdef01-2345-6789-abcd-ef0123456789",
    note: "Same rule, different prefix. Only the UUID substring matters.",
  },
  {
    id: "min",
    label: "Smallest non-zero UUID",
    taskId: "00000000-0000-0000-0000-000000000001",
    note: "Maps to the field element 1. Shows the mapping is a plain integer read, not a hash.",
  },
  {
    id: "max",
    label: "Largest UUID",
    taskId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    note: "2^128 - 1, still below the field prime, so no reduction applies on the UUID path.",
  },
  {
    id: "deadbeef",
    label: "Deadbeef filler UUID",
    taskId: "deadbeef-dead-beef-dead-beefdeadbeef",
    note: "Uppercase hex works too: the match is case-insensitive and the value is identical either way.",
  },
  {
    id: "fallback",
    label: "No UUID at all (fallback)",
    taskId: "not-a-uuid-at-all",
    note: "No UUID substring, so the SHA-256-mod-p fallback takes over. Compare its value with the UUID path on the other examples.",
  },
];
