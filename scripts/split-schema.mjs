#!/usr/bin/env node
/**
 * supabase/schema.sql をテーブル単位に分割して supabase/database/<table>.sql を生成する。
 * supabase db dump の出力フォーマットに依存しているため、Supabase CLI のバージョンアップ時は動作確認すること。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const schemaPath = join(root, "supabase", "schema.sql");
const outputDir = join(root, "supabase", "database");

if (!existsSync(schemaPath)) {
  console.error("supabase/schema.sql が見つかりません。先に supabase db dump を実行してください。");
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

const sql = readFileSync(schemaPath, "utf-8");

// セミコロン区切りで文を分割（複数行を考慮）
const statements = sql
  .split(/;\s*(?=\n|$)/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

/** 文がどのテーブルに属するかを判定する */
function resolveTable(stmt) {
  const patterns = [
    /CREATE TABLE\s+(?:public\.)?(\w+)\s/i,
    /ALTER TABLE\s+(?:public\.)?(\w+)\s+ENABLE ROW LEVEL SECURITY/i,
    /ALTER TABLE\s+(?:ONLY\s+)?(?:public\.)?(\w+)\s/i,
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+\w+\s+ON\s+(?:public\.)?(\w+)\s/i,
    /CREATE POLICY\s+.+\s+ON\s+(?:public\.)?(\w+)\s/i,
    /CREATE TRIGGER\s+\w+\s+.+\s+ON\s+(?:public\.)?(\w+)\s/i,
  ];

  for (const pattern of patterns) {
    const match = stmt.match(pattern);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

const tableMap = new Map(); // tableName -> string[]

for (const stmt of statements) {
  const table = resolveTable(stmt);
  if (!table) continue;

  if (!tableMap.has(table)) tableMap.set(table, []);
  tableMap.get(table).push(`${stmt};`);
}

if (tableMap.size === 0) {
  console.log("public スキーマにテーブルが見つかりませんでした。マイグレーション追加後に再実行してください。");
  process.exit(0);
}

for (const [table, stmts] of tableMap) {
  const header = [
    `-- Table: public.${table}`,
    `-- 自動生成ファイル。直接編集しないこと。`,
    `-- 変更する場合は supabase/migrations/ に新しいマイグレーションを追加し、npm run db:reset を実行する。`,
    "",
  ].join("\n");

  const content = `${header}\n${stmts.join("\n\n")}\n`;
  writeFileSync(join(outputDir, `${table}.sql`), content, "utf-8");
  console.log(`  → supabase/database/${table}.sql`);
}

console.log(`\n✓ ${tableMap.size} 件のテーブル定義を supabase/database/ に生成しました。`);
