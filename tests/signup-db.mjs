import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
// Execute the production schema and SQL in SQLite; expose the D1 methods we use.
export function signupDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../worker/migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  return {
    close: () => sqlite.close(),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(s => s.execute());
        sqlite.exec('COMMIT'); return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bound = values => ({
        bind: (...args) => bound(args),
        execute() {
          if (statement.columns().length) return { results: statement.all(...values).map(row => ({ ...row })), meta: {changes:0} };
          return { results: [], meta: { changes: Number(statement.run(...values).changes) } };
        },
        async all() { return { results: statement.all(...values).map(row => ({ ...row })) }; },
        async run() { return { meta: { changes: Number(statement.run(...values).changes) } }; }
      });
      return bound([]);
    }
  };
}
