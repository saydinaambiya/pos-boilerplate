import { describe, expect, it } from "vitest";

import { purchasesCsv, type PurchaseExportRow } from "./export";

const samplePurchase: PurchaseExportRow = {
  id: "00000000-0000-0000-0000-000000000001",
  companyName: "PT Sumber Makmur",
  invoiceNo: "INV/2026/001",
  total: 1_000_000,
  paidTotal: 400_000,
  balance: 600_000,
  status: "PARTIALLY_PAID",
  orderDate: "2026-09-01",
  dueDate: "2026-09-30",
  note: "DP 40%",
  createdAt: new Date("2026-09-01T08:00:00Z"),
};

const settledPurchase: PurchaseExportRow = {
  id: "00000000-0000-0000-0000-000000000002",
  companyName: "CV Maju Jaya",
  invoiceNo: "INV/2026/002",
  total: 500_000,
  paidTotal: 500_000,
  balance: 0,
  status: "SETTLED",
  orderDate: "2026-09-02",
  dueDate: null,
  note: null,
  createdAt: new Date("2026-09-02T09:00:00Z"),
};

describe("purchasesCsv (FR-PRB-04)", () => {
  it("formats rows with Indonesian headers, semicolon delimiter and status labels", () => {
    const lines = [...purchasesCsv([samplePurchase, settledPurchase], "id")];
    expect(lines[0]).toBe(
      "Nota Faktur;Nama Perusahaan;Tanggal PO;Tanggal Jatuh Tempo;Total Tagihan;Sudah dibayar;Sisa;Lunas/Cicil;Catatan\r\n",
    );
    expect(lines[1]).toBe(
      "INV/2026/001;PT Sumber Makmur;2026-09-01;2026-09-30;1000000;400000;600000;Dicicil;DP 40%\r\n",
    );
    expect(lines[2]).toBe("INV/2026/002;CV Maju Jaya;2026-09-02;;500000;500000;0;Lunas;\r\n");
  });

  it("formats rows with English headers, comma delimiter and status labels", () => {
    const lines = [...purchasesCsv([samplePurchase, settledPurchase], "en")];
    expect(lines[0]).toBe(
      "Invoice,Company,PO date,Due date,Total due,Paid,Remaining,Paid/Credit,Note\r\n",
    );
    expect(lines[1]).toBe(
      "INV/2026/001,PT Sumber Makmur,2026-09-01,2026-09-30,1000000,400000,600000,In installments,DP 40%\r\n",
    );
    expect(lines[2]).toBe("INV/2026/002,CV Maju Jaya,2026-09-02,,500000,500000,0,Paid,\r\n");
  });
});
