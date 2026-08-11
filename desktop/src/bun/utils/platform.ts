import { execSync } from "child_process";
import { homedir } from "os";
import { join, dirname, basename } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { Utils } from "electrobun/bun";
import { APP_IDENTIFIER } from "../../shared/app_ident";

const is_mac = (): boolean => process.platform === "darwin";
const is_windows = (): boolean => process.platform === "win32";
const is_linux = (): boolean => process.platform === "linux";

export function reveal_file(path: string): void {
  if (is_mac()) {
    const result = Bun.spawnSync(["open", "-R", path]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to reveal in Finder: ${result.stderr.toString()}`);
    }
  } else if (is_windows()) {
    const result = Bun.spawnSync(["explorer", "/select,", path]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to reveal in Explorer: ${result.stderr.toString()}`);
    }
  } else if (is_linux()) {
    const dir = dirname(path);
    const result = Bun.spawnSync(["xdg-open", dir]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to open folder: ${result.stderr.toString()}`);
    }
  }
}

export function get_downloads_dir(): string {
  if (is_linux()) {
    try {
      const dir = execSync("xdg-user-dir DOWNLOAD", {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      if (dir) return dir;
    } catch {}
  }
  return join(homedir(), "Downloads");
}

export const get_app_data_dir = (): string => Utils.paths.userData;
export const get_storage_dir = (): string => join(get_app_data_dir(), "storage");

// auto startup
function derive_bundle_path(): string {
  if (is_mac()) {
    const p = process.execPath;
    return p.includes("/Contents/MacOS/")
      ? p.substring(0, p.indexOf("/Contents/MacOS/"))
      : p;
  }
  return process.execPath;
}

function derive_app_name(): string {
  const bundlePath = derive_bundle_path();
  const name = bundlePath.split("/").pop()?.replace(/\.app$/, "") || "WorkBound";
  return name;
}

function get_auto_startup_mac(): boolean {
  try {
    const result = Bun.spawnSync(["osascript", "-e",
      `tell application "System Events" to get name of every login item`
    ]);
    if (result.exitCode !== 0) return false;
    const output = result.stdout.toString().trim();
    const items = output.split(", ").map((s) => s.trim()).filter(Boolean);
    return items.includes(derive_app_name());
  } catch {
    return false;
  }
}

function set_auto_startup_mac(enabled: boolean): void {
  const bundlePath = derive_bundle_path();
  const appName = derive_app_name();
  const cmd = enabled
    ? `tell application "System Events" to make login item at end with properties {path:"${bundlePath}", hidden:false}`
    : `tell application "System Events" to delete login item "${appName}"`;
  Bun.spawnSync(["osascript", "-e", cmd]);
}

function get_auto_startup_win(): boolean {
  try {
    const appName = derive_app_name();
    const result = Bun.spawnSync(["reg", "query",
      `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`,
      "/v", appName
    ]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function set_auto_startup_win(enabled: boolean): void {
  const appName = derive_app_name();
  const exePath = process.execPath;
  if (enabled) {
    Bun.spawnSync(["reg", "add",
      `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`,
      "/v", appName,
      "/t", "REG_SZ",
      "/d", `"${exePath}" --start-in-tray`,
      "/f"
    ]);
  } else {
    Bun.spawnSync(["reg", "delete",
      `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`,
      "/v", appName,
      "/f"
    ]);
  }
}

function get_auto_startup_linux(): boolean {
  try {
    const appName = derive_app_name().toLowerCase();
    const home = homedir();
    const desktopFile = join(home, ".config", "autostart", `${appName}.desktop`);
    const { statSync } = require("fs") as typeof import("fs");
    statSync(desktopFile);
    return true;
  } catch {
    return false;
  }
}

function set_auto_startup_linux(enabled: boolean): void {
  const appName = derive_app_name().toLowerCase();
  const home = homedir();
  const autostartDir = join(home, ".config", "autostart");
  const desktopFile = join(autostartDir, `${appName}.desktop`);

  if (enabled) {
    const { mkdirSync, writeFileSync } = require("fs") as typeof import("fs");
    mkdirSync(autostartDir, { recursive: true });
    writeFileSync(desktopFile, [
      "[Desktop Entry]",
      "Type=Application",
      `Name=${derive_app_name()}`,
      `Exec=${process.execPath} --start-in-tray`,
      "X-GNOME-Autostart-enabled=true",
      "",
    ].join("\n"), "utf-8");
  } else {
    try {
      const { unlinkSync } = require("fs") as typeof import("fs");
      unlinkSync(desktopFile);
    } catch {
      // file may not exist
    }
  }
}

export function get_auto_startup(): boolean {
  if (is_mac()) return get_auto_startup_mac();
  if (is_windows()) return get_auto_startup_win();
  if (is_linux()) return get_auto_startup_linux();
  return false;
}

export function set_auto_startup(enabled: boolean): void {
  if (is_mac()) return set_auto_startup_mac(enabled);
  if (is_windows()) return set_auto_startup_win(enabled);
  if (is_linux()) return set_auto_startup_linux(enabled);
}

// app startup
const bundle_in_applications = (bundle_path: string): boolean => bundle_path.startsWith("/Applications/");

function bundle_executable_name(bundle_path: string): string | null {
  const plist = join(bundle_path, "Contents", "Info.plist");
  if (!existsSync(plist)) return null;
  const result = Bun.spawnSync(["/usr/libexec/PlistBuddy", "-c", "Print :CFBundleExecutable", plist]);
  if (result.exitCode !== 0) return null;
  const name = result.stdout.toString().trim();
  return name || null;
}
const relaunch_marker_path = (): string => join(get_app_data_dir(), "relaunch-ok");

export function is_in_applications_folder(): boolean {
  if (!is_mac()) return false;
  return bundle_in_applications(derive_bundle_path());
}
export const is_dev_build = (): boolean => derive_app_name().endsWith("-dev");
export const can_move_to_applications = (): boolean => is_mac() && !is_in_applications_folder();

export function move_to_applications(): void {
  if (!is_mac()) throw new Error("Move to Applications is macOS only");
  if (is_in_applications_folder()) return;

  const { rmSync } = require("fs") as typeof import("fs");
  const src = derive_bundle_path();
  const app_name = derive_app_name();
  const tmp = join("/Applications", `${app_name}.app.tmp`);
  const dest = join("/Applications", `${app_name}.app`);
  const marker = relaunch_marker_path();

  rmSync(marker, { force: true });
  rmSync(tmp, { recursive: true, force: true });

  const copy = Bun.spawnSync(["cp", "-Rc", src, tmp]);
  if (copy.exitCode !== 0) {
    rmSync(tmp, { recursive: true, force: true });
    throw new Error(`Copy to /Applications failed: ${copy.stderr?.toString() || "unknown error"}`);
  }

  const executable = bundle_executable_name(tmp);
  const exe = executable ? join(tmp, "Contents", "MacOS", executable) : null;
  const macos_dir = join(tmp, "Contents", "MacOS");
  const complete =
    (exe !== null && existsSync(exe)) ||
    (executable === null && existsSync(macos_dir) && existsSync(join(tmp, "Contents", "Info.plist")));
  if (!complete) {
    rmSync(tmp, { recursive: true, force: true });
    throw new Error(`Copied bundle is incomplete (missing ${exe || join(macos_dir, "<executable>")})`);
  }

  rmSync(dest, { recursive: true, force: true });
  const move = Bun.spawnSync(["mv", tmp, dest]);
  if (move.exitCode !== 0) {
    rmSync(tmp, { recursive: true, force: true });
    throw new Error(`Failed to place bundle in /Applications: ${move.stderr?.toString() || "unknown error"}`);
  }

  Bun.spawn(["open", dest, "--args", `--relaunch-from=${src}`], { stdout: "ignore", stderr: "ignore" }).unref();

  supervise_move(src);
}

function supervise_move(old_bundle: string): void {
  const marker = relaunch_marker_path();
  const deadline = Date.now() + 15000;
  const timer = setInterval(() => {
    if (existsSync(marker)) {
      clearInterval(timer);
      const { rmSync } = require("fs") as typeof import("fs");
      try {
        rmSync(old_bundle, { recursive: true, force: true });
      } catch {}
      try {
        rmSync(marker, { force: true });
      } catch {}
      setTimeout(() => process.exit(0), 100);
      return;
    }
    if (Date.now() > deadline) {
      clearInterval(timer);
    }
  }, 1000);
}

function dock_has_bundle(bundle_path: string): boolean {
  try {
    const result = Bun.spawnSync(["defaults", "read", "com.apple.dock", "persistent-apps"]);
    if (result.exitCode !== 0) return false;
    return result.stdout.toString().includes(bundle_path);
  } catch {
    return false;
  }
}

export function is_pinned_to_dock(): boolean {
  if (!is_mac()) return false;
  return dock_has_bundle(derive_bundle_path());
}

export function add_to_dock(): void {
  if (!is_mac()) throw new Error("Dock pinning is macOS only");
  const bundle_path = derive_bundle_path();
  if (!bundle_in_applications(bundle_path)) {
    throw new Error("Add to Dock requires the app to live in /Applications first");
  }
  if (dock_has_bundle(bundle_path)) return;
  const dict = `<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>${bundle_path}</string><key>_CFURLStringType</key><integer>0</integer></dict></dict></dict>`;
  const result = Bun.spawnSync(["defaults", "write", "com.apple.dock", "persistent-apps", "-array-add", dict]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to add to Dock: ${result.stderr?.toString() || "unknown error"}`);
  }
  Bun.spawnSync(["killall", "Dock"]);
}

function start_menu_lnk_path(): string {
  const base = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  return join(base, "Microsoft", "Windows", "Start Menu", "Programs", "WorkBound.lnk");
}

export function is_in_start_menu(): boolean {
  if (!is_windows()) return false;
  return existsSync(start_menu_lnk_path());
}

export function add_to_start_menu(): void {
  if (!is_windows()) throw new Error("Start Menu shortcut is Windows only");
  const lnk = start_menu_lnk_path();
  mkdirSync(dirname(lnk), { recursive: true });
  const ps = [
    "$s = New-Object -ComObject WScript.Shell;",
    `$sc = $s.CreateShortcut('${lnk.replace(/'/g, "''")}');`,
    `$sc.TargetPath = '${process.execPath.replace(/'/g, "''")}';`,
    "$sc.Save()",
  ].join(" ");
  const result = Bun.spawnSync(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to create Start Menu shortcut: ${result.stderr?.toString() || "unknown error"}`);
  }
}

function linux_desktop_file_path(): string {
  const app_name = derive_app_name().toLowerCase();
  return join(homedir(), ".local", "share", "applications", `${app_name}.desktop`);
}

export function is_desktop_file_present(): boolean {
  if (!is_linux()) return false;
  return existsSync(linux_desktop_file_path());
}

export function write_desktop_file(): void {
  if (!is_linux()) throw new Error("Desktop file is Linux only");
  const path = linux_desktop_file_path();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${derive_app_name()}`,
    `Exec=${process.execPath}`,
    `Icon=${derive_app_name()}`,
    "MimeType=x-scheme-handler/mailto;",
    "",
  ].join("\n"), "utf-8");
}

export function is_default_mail_handler(): boolean {
  if (is_mac()) {
    try {
      const result = Bun.spawnSync(["defaults", "read", "com.apple.LaunchServices/com.apple.launchservices.secure", "LSHandlers"]);
      if (result.exitCode !== 0) return false;
      const out = result.stdout.toString();
      const block = out.split(/^}\s*,?\s*$/m).find((chunk) => chunk.includes("LSHandlerURLScheme = mailto;"));
      if (!block) return false;
      const m = block.match(/LSHandlerRoleAll = "([^"]+)";\s*\n\s*LSHandlerURLScheme = mailto;/);
      return !!m && m[1] === APP_IDENTIFIER;
    } catch {
      return false;
    }
  }
  if (is_linux()) {
    try {
      const result = Bun.spawnSync(["xdg-mime", "query", "default", "x-scheme-handler/mailto"]);
      if (result.exitCode !== 0) return false;
      return result.stdout.toString().trim() === basename(linux_desktop_file_path());
    } catch {
      return false;
    }
  }
  return false;
}

export function get_launcher_present(): boolean {
  if (is_mac()) return is_pinned_to_dock();
  if (is_windows()) return is_in_start_menu();
  if (is_linux()) return is_desktop_file_present();
  return false;
}

export function get_launcher_label(): string {
  if (is_mac()) return "Add to Dock";
  if (is_windows()) return "Add to Start Menu";
  if (is_linux()) return "Add application launcher";
  return "Add launcher entry";
}

export function add_launcher(): void {
  if (is_mac()) return add_to_dock();
  if (is_windows()) return add_to_start_menu();
  if (is_linux()) return write_desktop_file();
  throw new Error("Launcher entry is not supported on this platform");
}

export function open_default_apps_settings(): void {
  if (is_windows()) {
    Bun.spawn(["cmd", "/c", "start", "ms-settings:defaultapps"], { stdout: "ignore", stderr: "ignore" }).unref();
  }
}

export function register_mailto_handler(): void {
  if (is_mac()) {
    Bun.spawn(["open", "-a", "Mail"], { stdout: "ignore", stderr: "ignore" }).unref();
    return;
  }
  if (is_windows()) {
    try {
      Bun.spawnSync(["reg", "add", `HKCU\\Software\\Classes\\mailto\\shell\\open\\command`, "/f", "/t", "REG_SZ", "/d", `"${process.execPath}" "%1"`]);
    } catch {}
    open_default_apps_settings();
    return;
  }
  if (is_linux()) {
    write_desktop_file();
    Bun.spawnSync(["xdg-mime", "default", basename(linux_desktop_file_path()), "x-scheme-handler/mailto"]);
    return;
  }
}
