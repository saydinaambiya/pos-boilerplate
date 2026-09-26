import { describe, expect, it } from "vitest";

import { capacityLevel, usedPercent } from "./levels";

describe("database capacity levels (FR-CAP-03)", () => {
  it("steps up at 70, 85 and 95 percent", () => {
    expect(capacityLevel(69.9)).toBe("ok");
    expect(capacityLevel(70)).toBe("info");
    expect(capacityLevel(85)).toBe("warning");
    expect(capacityLevel(95)).toBe("critical");
    expect(capacityLevel(120)).toBe("critical");
  });

  it("rounds the share to one decimal", () => {
    expect(usedPercent(350 * 1024 * 1024, 500 * 1024 * 1024)).toBe(70);
    expect(usedPercent(1, 3)).toBe(33.3);
    expect(usedPercent(10, 0)).toBe(0);
  });
});
