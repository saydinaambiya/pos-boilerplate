import { describe, expect, it } from "vitest";

import { appConfig } from "./app.config";
import { appConfigSchema } from "./app-config.schema";

describe("app config (PRD §10.3)", () => {
  it("ships a valid default configuration", () => {
    expect(appConfigSchema.safeParse(appConfig).success).toBe(true);
  });

  it.each([
    ["an unknown palette", { appearance: { ...appConfig.appearance, palette: "neon" } }],
    [
      "a logo outside public/brand",
      {
        brand: {
          ...appConfig.brand,
          logo: { ...appConfig.brand.logo, light: "https://evil.example/logo.svg" },
        },
      },
    ],
    ["a misspelled key", { appearance: { ...appConfig.appearance, pallete: "sage" } }],
    ["an over-long app name", { brand: { ...appConfig.brand, appName: "x".repeat(41) } }],
  ])("rejects %s", (_, override) => {
    expect(appConfigSchema.safeParse({ ...appConfig, ...override }).success).toBe(false);
  });
});
