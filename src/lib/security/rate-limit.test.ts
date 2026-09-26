import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryCounter, createUpstashCounter } from "./rate-limit";

describe("createMemoryCounter (FR-AUTH-04)", () => {
  it("counts within a fixed window and resets afterwards", async () => {
    let now = 0;
    const counter = createMemoryCounter(() => now);

    await counter.increment("ip", 60);
    await counter.increment("ip", 60);
    expect(await counter.get("ip")).toEqual({ count: 2, resetSeconds: 60 });

    now = 30_000;
    expect(await counter.get("ip")).toEqual({ count: 2, resetSeconds: 30 });

    now = 60_000;
    expect(await counter.get("ip")).toEqual({ count: 0, resetSeconds: 0 });
  });

  it("keeps keys independent", async () => {
    const counter = createMemoryCounter(() => 0);
    await counter.increment("a", 60);
    expect((await counter.get("b")).count).toBe(0);
  });
});

describe("createUpstashCounter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses one pipeline call per operation with a window set only once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([{ result: 1 }, { result: 1 }]))
      .mockResolvedValueOnce(Response.json([{ result: "3" }, { result: 42 }]));
    vi.stubGlobal("fetch", fetchMock);
    const counter = createUpstashCounter("https://redis.example", "token");

    await counter.increment("ip", 900);
    expect(await counter.get("ip")).toEqual({ count: 3, resetSeconds: 42 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://redis.example/pipeline");
    expect(JSON.parse(init.body as string)).toEqual([
      ["INCR", "ip"],
      ["EXPIRE", "ip", 900, "NX"],
    ]);
  });

  it("surfaces Upstash errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([{ error: "ERR" }, {}])));
    await expect(createUpstashCounter("https://r", "t").get("k")).rejects.toThrow("ERR");
  });
});
