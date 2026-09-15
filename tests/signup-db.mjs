import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
// Execute the production schema and SQL in SQLite; expose the D1 methods we use.
export function signupDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../worker/migrations/0001_signups.sql', import.meta.url), 'utf8'));
  return {
    close: () => sqlite.close(),
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bound = values => ({
        bind: (...args) => bound(args),
        async all() { return { results: statement.all(...values).map(row => ({ ...row })) }; },
        async run() { return { meta: { changes: Number(statement.run(...values).changes) } }; }
      });
      return bound([]);
    }
  };
}
