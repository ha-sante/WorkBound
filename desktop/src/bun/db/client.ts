import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { join } from "path";
import { mkdirSync, statSync } from "fs";
import { run_setup } from "./setup";
import { get_app_data_dir } from "../utils/platform";

const DB_DIR = get_app_data_dir();
const DB_PATH = join(DB_DIR, "workbound.db");

let _db: ReturnType<typeof drizzle> | null = null;
let _sqlite: Database | null = null;

export function getDb() {
  if (!_db) {
    mkdirSync(DB_DIR, { recursive: true });
    _sqlite = new Database(DB_PATH);
    _sqlite.exec("PRAGMA journal_mode = WAL");
    _sqlite.exec("PRAGMA foreign_keys = ON");
    run_setup(_sqlite);
    _db = drizzle({ client: _sqlite });
  }
  return _db;
}

export function get_raw_db(): Database {
  getDb();
  return _sqlite!;
}

export function get_db_path(): string {
  getDb();
  return DB_PATH;
}

export function get_db_size(): number {
  try {
    return statSync(DB_PATH).size;
  } catch {
    return 0;
  }
}
