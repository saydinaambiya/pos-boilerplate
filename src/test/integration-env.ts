import { inject } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");
process.env.APP_URL ??= "http://localhost:3000";
