import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoDir, "scripts", "determine-refresh-path.sh");

function determinePath(eventName, scheduleCron = "", easternOffset = "-0400", diagnosticsOnly = "false") {
  const output = path.join(mkdtempSync(path.join(tmpdir(), "refresh-gate-")), "output");
  execFileSync(script, [], {
    cwd: repoDir,
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: eventName,
      GITHUB_OUTPUT: output,
      SCHEDULE_CRON: scheduleCron,
      EASTERN_UTC_OFFSET: easternOffset,
      DIAGNOSTICS_ONLY: diagnosticsOnly,
    },
  });
  return Object.fromEntries(
    readFileSync(output, "utf8")
      .trim()
      .split("\n")
      .map((line) => line.split(/=(.*)/s).slice(0, 2))
  );
}

test("manual dispatch refreshes and pushes only deploy the committed cache", () => {
  assert.equal(determinePath("workflow_dispatch").should_refresh, "true");
  assert.equal(determinePath("workflow_dispatch", "", "-0400", "true").should_deploy, "false");
  assert.deepEqual(
    { shouldRefresh: determinePath("push").should_refresh, shouldRun: determinePath("push").should_run },
    { shouldRefresh: "false", shouldRun: "true" }
  );
});

test("scheduled refreshes use the triggering cron rather than delayed runner time", () => {
  for (const cron of ["0 16 * * 1,4", "31 22 * * 2"]) {
    assert.equal(determinePath("schedule", cron, "-0400").should_refresh, "true");
    assert.equal(determinePath("schedule", cron, "-0500").should_run, "false");
  }
  for (const cron of ["0 17 * * 1,4", "31 23 * * 2"]) {
    assert.equal(determinePath("schedule", cron, "-0500").should_refresh, "true");
    assert.equal(determinePath("schedule", cron, "-0400").should_run, "false");
  }
});
