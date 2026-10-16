import { describe, expect, it } from "vitest";

import { matchesGoods, searchBatches } from "./goods-filter";

const karpet = {
  name: "Karpet Mihrab · 93cm x 47cm",
  variantName: "Merah",
  brandName: "Turkiye",
  motif: "Bunga",
  colorName: "Merah",
};
const sajadah = {
  name: "Sajadah",
  variantName: null,
  brandName: null,
  motif: null,
  colorName: "Hijau",
};

describe("matchesGoods (FR-CSG-11)", () => {
  it("needs every word somewhere in the brand, name, motif or colour", () => {
    expect(matchesGoods(karpet, "")).toBe(true);
    expect(matchesGoods(karpet, "turkiye merah")).toBe(true);
    expect(matchesGoods(karpet, "  BUNGA   mihrab ")).toBe(true);
    expect(matchesGoods(karpet, "turkiye hijau")).toBe(false);
    expect(matchesGoods(sajadah, "hijau")).toBe(true);
  });
});

describe("searchBatches (FR-CSG-11)", () => {
  const batches = [
    { id: "a", actorName: "Budi", invoiceNo: null, note: null, items: [karpet, sajadah] },
    { id: "b", actorName: "Sari", invoiceNo: "INV-20261016-0007", note: null, items: [karpet] },
    { id: "c", actorName: "Sari", invoiceNo: null, note: "salah input", items: [sajadah] },
  ];

  it("keeps everything without a search", () => {
    expect(searchBatches(batches, " ")).toEqual(batches);
  });

  it("keeps only matching lines and drops batches left empty", () => {
    expect(searchBatches(batches, "sajadah")).toEqual([
      { ...batches[0], items: [sajadah] },
      batches[2],
    ]);
  });

  it("keeps a batch whole when its invoice, recorder or note matches", () => {
    expect(searchBatches(batches, "0007")).toEqual([batches[1]]);
    expect(searchBatches(batches, "budi")).toEqual([batches[0]]);
    expect(searchBatches(batches, "salah")).toEqual([batches[2]]);
  });
});
