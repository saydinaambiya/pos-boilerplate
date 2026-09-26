import { inject } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");
process.env.APP_URL ??= "http://localhost:3000";
process.env.INVOICE_LINK_SECRET ??= "integration-invoice-link-secret-0123456789";
