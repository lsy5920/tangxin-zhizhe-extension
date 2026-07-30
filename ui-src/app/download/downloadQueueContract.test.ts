import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("download queue background contract", () => {
  it("persists and acknowledges a planned task before asynchronous dispatch", () => {
    const source = readFileSync(new URL("../../../background.js", import.meta.url), "utf8");
    const start = source.indexOf("async function downloadFullVideo");
    const end = source.indexOf("async function applyDownloadProgress", start);
    const implementation = source.slice(start, end);

    expect(implementation).toContain("const planned = takeDownloadPlanTicket(message)");
    expect(implementation).toContain("if (existingTask && (isDownloadRunning(existingTask)");
    expect(implementation).toContain("await saveState(queued)");
    expect(implementation).toContain("scheduleDownloadDispatch(0)");
    expect(implementation).toContain("state: sanitizeState(queued)");
    expect(implementation).not.toContain("await runDownloadScheduler()");
  });
});
