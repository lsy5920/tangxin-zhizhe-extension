import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentDirectories = [
  new URL("./", import.meta.url),
  new URL("../download/", import.meta.url),
  new URL("../player/", import.meta.url)
];

describe("cinema form field contract", () => {
  it("gives every field a stable id or name for autofill and DevTools", () => {
    const missingIdentity: string[] = [];

    for (const directoryUrl of componentDirectories) {
      const directory = fileURLToPath(directoryUrl);
      for (const filename of readdirSync(directory)) {
        if (extname(filename) !== ".tsx" || filename.endsWith(".test.tsx")) continue;
        const source = readFileSync(join(directory, filename), "utf8");
        const fields = source.match(/<(?:input|select|textarea)\b[\s\S]*?>/g) || [];
        for (const field of fields) {
          if (!/\b(?:id|name)\s*=/.test(field)) missingIdentity.push(`${filename}: ${field.replace(/\s+/g, " ")}`);
        }
      }
    }

    expect(missingIdentity).toEqual([]);
  });
});
