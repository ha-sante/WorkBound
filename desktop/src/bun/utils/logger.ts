import { appendFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join } from "path";
import { Utils } from "electrobun/bun";
import { error_message } from "../../shared/errors";

const LOG_DIR = Utils.paths.userLogs;
const LOG_FILE = join(LOG_DIR, "workbound.log");
const MAX_SIZE = 10 * 1024 * 1024;

let _dirEnsured = false;
function ensure_dir() {
  if (_dirEnsured) return;
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  _dirEnsured = true;
}

const ts = () => new Date().toISOString();

function maybe_truncate() {
  if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > MAX_SIZE) {
    writeFileSync(LOG_FILE, "", "utf-8");
  }
}

function write(level: string, tag: string, msg: string, consoleOutput = true) {
  ensure_dir();
  maybe_truncate();
  const line = `[${ts()}] [${level.toUpperCase()}] [${tag}] ${msg}`;
  appendFileSync(LOG_FILE, line + "\n");
  if (consoleOutput && msg.length < 1000) {
    const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    out(`${ts().slice(11, 23)} [${level.toUpperCase()}] [${tag}] ${msg}`);
  }
}

const fmt_error = (msg: string, err?: unknown) => err ? `${msg} | ${error_message(err)}` : msg;

export const logger = {
  debug(tag: string, msg: string) { write("debug", tag, msg, false); },
  info(tag: string, msg: string) { write("info", tag, msg); },
  warn(tag: string, msg: string) { write("warn", tag, msg); },
  error(tag: string, msg: string, err?: unknown) { write("error", tag, fmt_error(msg, err)); },
  file(tag: string) {
    return {
      info: (msg: string) => write("info", tag, msg, false),
      warn: (msg: string) => write("warn", tag, msg, false),
      error: (msg: string, err?: unknown) => write("error", tag, fmt_error(msg, err), false),
    };
  },
};
