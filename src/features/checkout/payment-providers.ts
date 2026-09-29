import "server-only";

import { and, eq } from "drizzle-orm";

import type { Executor } from "@/db/client";
import { bankAccounts } from "@/db/schema";

import type { CheckoutPayment } from "./schemas";

export interface PreparedPayment {
  method: CheckoutPayment["method"];
  amount: number;
  bankAccountId: string | null;
  sourceBank: string | null;
  status: "SETTLED" | "PENDING";
  providerPayload: Record<string, unknown> | null;
}

/**
 * A payment method behind a common interface (FR-PAY-06). Checkout only
 * talks to providers, so an online gateway such as Midtrans can be added by
 * registering a provider that returns `PENDING` and settles via webhook.
 */
export interface PaymentProvider {
  prepare(executor: Executor, payment: CheckoutPayment): Promise<PreparedPayment | null>;
}

const cash: PaymentProvider = {
  prepare(_executor, payment) {
    if (payment.bankAccountId !== undefined) return Promise.resolve(null);
    return Promise.resolve({
      method: "CASH",
      amount: payment.amount,
      bankAccountId: null,
      sourceBank: null,
      status: "SETTLED",
      providerPayload: null,
    });
  },
};

/** Manual transfer to an active store account, verified by the cashier (FR-PAY-04, BRD assumption 4). */
const transfer: PaymentProvider = {
  async prepare(executor, payment) {
    if (!payment.bankAccountId || payment.sourceBank !== undefined) return null;
    const [account] = await executor
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, payment.bankAccountId), eq(bankAccounts.isActive, true)))
      .limit(1);
    if (!account) return null;
    return {
      method: "TRANSFER",
      amount: payment.amount,
      bankAccountId: account.id,
      sourceBank: null,
      status: "SETTLED",
      providerPayload: null,
    };
  },
};

/**
 * QRIS paid into the store's one QRIS account, which is filled in here and
 * never chosen by the cashier; the buyer's bank or e-wallet is required
 * (FR-PAY-07, ADR-0025).
 */
const qris: PaymentProvider = {
  async prepare(executor, payment) {
    if (!payment.sourceBank || payment.bankAccountId !== undefined) return null;
    const [account] = await executor
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.isQris, true), eq(bankAccounts.isActive, true)))
      .limit(1);
    if (!account) return null;
    return {
      method: "QRIS",
      amount: payment.amount,
      bankAccountId: account.id,
      sourceBank: payment.sourceBank,
      status: "SETTLED",
      providerPayload: null,
    };
  },
};

export const paymentProviders: Record<CheckoutPayment["method"], PaymentProvider> = {
  CASH: cash,
  TRANSFER: transfer,
  QRIS: qris,
};
