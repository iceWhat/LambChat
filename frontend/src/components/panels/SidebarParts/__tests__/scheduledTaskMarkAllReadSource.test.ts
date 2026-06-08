import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../SessionListContent.tsx", import.meta.url),
  "utf8",
);

test("scheduled task mark-all-read clears the task summary unread count after success", () => {
  assert.match(source, /handleScheduledTaskMarkAllRead/);
  assert.match(source, /await onMarkAllRead\(\{ scheduledTaskId \}\)/);
  assert.match(source, /setScheduledTasks\(\(prev\) =>/);
  assert.match(source, /task\.id === scheduledTaskId/);
  assert.match(source, /unread_count: 0/);
  assert.match(
    source,
    /onMarkAllRead=\{\(\) =>\s+handleScheduledTaskMarkAllRead\(task\.id\)\s+\}/,
  );
});
