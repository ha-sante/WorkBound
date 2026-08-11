import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { Utils } from "electrobun/bun";

type TelScope = {
  mark(label: string): void;
  done(): void;
};

const LOG_DIR = Utils.paths.userLogs;
const TEL_FILE = join(LOG_DIR, "workbound_tel.log");
const MAX_SIZE = 10 * 1024 * 1024;

let _dir_ensured = false;
const ts = () => new Date().toISOString();

function ensure_dir() {
  if (_dir_ensured) return;
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  _dir_ensured = true;
}

function maybe_truncate() {
  if (existsSync(TEL_FILE) && statSync(TEL_FILE).size > MAX_SIZE) {
    writeFileSync(TEL_FILE, "", "utf-8");
  }
}

function write_line(prefix: string, name: string, label: string, duration_ms: number, id?: string) {
  ensure_dir();
  maybe_truncate();
  const id_part = id ? ` id=${id}` : "";
  appendFileSync(TEL_FILE, `[${ts()}] [TEL] [${prefix}] ${name} ${label} ${duration_ms}ms${id_part}\n`);
}

export class Tel {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  start(name: string, id?: string): TelScope {
    const start_ms = Date.now();
    let prev_ms = start_ms;
    let closed = false;

    return {
      mark: (label: string) => {
        const now = Date.now();
        write_line(this.prefix, name, label, now - prev_ms, id);
        prev_ms = now;
      },
      done: () => {
        if (closed) return;
        closed = true;
        write_line(this.prefix, name, "total", Date.now() - start_ms, id);
      },
    };
  }
}
