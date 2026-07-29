import { describe, expect, it } from "vitest";
import { progressPreviewAlignment } from "./PlayerControls";

describe("进度条实时画面的边界对齐", () => {
  it("左右边缘不溢出，中段始终以进度点居中", () => {
    expect(progressPreviewAlignment(0)).toBe("start");
    expect(progressPreviewAlignment(15)).toBe("start");
    expect(progressPreviewAlignment(15.01)).toBe("center");
    expect(progressPreviewAlignment(50)).toBe("center");
    expect(progressPreviewAlignment(84.99)).toBe("center");
    expect(progressPreviewAlignment(85)).toBe("end");
    expect(progressPreviewAlignment(100)).toBe("end");
  });
});
