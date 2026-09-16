import { sql } from 'drizzle-orm';

export const up = sql`
  ALTER TABLE leads ADD COLUMN converted INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE leads ADD COLUMN sales_generated INTEGER NOT NULL DEFAULT 0;
`;

export const down = sql`
  ALTER TABLE leads DROP COLUMN converted;
  ALTER TABLE leads DROP COLUMN sales_generated;
`;
