# Lanzador Claude Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Windows desktop app "Lanzador Claude" (Tauri 2) that browses folders, configures Claude Code flags/env vars with pin/active checkboxes, launches Claude in a terminal, creates new projects with CLAUDE.md + skills, and ships as NSIS/MSI installers.

**Architecture:** Rust "engine" (`src-tauri/`) exposes Tauri commands grouped by module (config, catalog, launch, fs, skills, project, integration). React + TypeScript UI (`src/`) calls them through one typed `api.ts`. Pure logic (command building, checkbox rules, i18n parity) is unit-tested on both sides.

**Tech Stack:** Tauri 2, Rust 1.99 (msvc), React 18, TypeScript 5, Vite, Vitest, zustand, plugins: autostart, global-shortcut, single-instance, updater, opener, notification, dialog, process; crates: serde/serde_json, dirs, sys-locale, keyring (windows-native), winreg, sha2, chrono, tempfile (dev), thiserror.

**Spec:** `docs/superpowers/specs/2026-10-20-lanzador-claude-design.md` (read it). Visual reference: `docs/reference/maqueta.html` (copy its tokens, layout, copy text, and About/story texts verbatim). Claude CLI reference: `docs/reference/claude-help.txt`.

## Global Constraints

- Windows 10/11 x64 primary; must also compile for `aarch64-pc-windows-msvc` in CI.
- Product name `Lanzador Claude`; identifier `com.ideonetworks.lanzadorclaude`; exe `lanzador-claude.exe`; version `0.1.0`.
- Primary color `#006EB3` (dark theme `#2b8fd6`); pin purple `#7B3FE4` (dark `#9a6bff`); fonts Roboto + Roboto Mono bundled locally (`@fontsource/roboto`, `@fontsource/roboto-mono`), no CDN at runtime.
- Languages `es`, `en`, `zh` (zh = Simplified Chinese). Every UI string goes through i18n.
- Config file: `%APPDATA%\iDeo\LanzadorClaude\config.json`; skills cache `%APPDATA%\iDeo\LanzadorClaude\skills-repo`; launch scripts `%LOCALAPPDATA%\iDeo\LanzadorClaude\launch\`; installer seed `HKCU\Software\iDeo\LanzadorClaude\Seed`.
- Default root folder `C:\Desarrollo`; default shortcut `Ctrl+Alt+I`; default target `wt`.
- No telemetry, no network calls except: `git clone/pull` of the configured skills repo, the updater endpoint, and links the user clicks.
- Secrets (`ANTHROPIC_API_KEY`, skills repo token) only in Windows Credential Manager via `keyring` (service `LanzadorClaude`); previews show `••••`.
- About dialog content is fixed (not brandable): texts and links exactly as in spec §4.9.
- License GPLv3. Commit after every task with Conventional Commits; end commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rust: `cargo clippy -- -D warnings` clean; TS: `tsc --noEmit` clean.

## Review Focus

1. Paths with spaces, apostrophes, `;`, `&` or non-ASCII (`C:\Proyectos\José's app; v2`) — preview and launched command must open Claude in that exact folder. (Task 4 tests.)
2. Unreadable folders (`System Volume Information`, access denied) and junction loops in the tree — skipped silently, never crash or hang. (Task 5 tests.)
3. Root folder missing / network drive disconnected — tree shows an error row and "Este equipo" still works. (Task 5 test + Task 9.)
4. Corrupt or older `config.json` — renamed to `config.json.bak`, defaults loaded, app starts. Unknown fields ignored, missing fields defaulted. (Task 2 tests.)
5. `git` missing, invalid skills repo URL or offline — clear localized error, rest of the app works; project creation still succeeds without skills. (Task 7 tests.)

---

## File structure

```
package.json, vite.config.ts, tsconfig.json, index.html
src/
  main.tsx, App.tsx
  api.ts                 typed invoke wrappers + TS types mirroring Rust
  store.ts               zustand store (config, catalog, selection, ui)
  logic/checkboxes.ts    pin/active rules (pure)
  logic/selection.ts     selection <-> profile helpers (pure)
  i18n/index.ts, i18n/es.json, i18n/en.json, i18n/zh.json
  styles/tokens.css, styles/app.css
  components/  TopBar, NavRail, FolderTree, FolderInfo, OptionsPanel, OptionRow, CommandFooter, StatusBar, AboutDialog, SearchPalette, Toast
  views/       LaunchView, NewProjectView, ProfilesView, SkillsView, HistoryView, SettingsView
  __tests__/   *.test.ts
src-tauri/
  Cargo.toml, tauri.conf.json, build.rs, capabilities/default.json
  resources/catalog.json
  windows/nsis/installer-hooks.nsh, windows/wix/seed-fragment.wxs
  src/ main.rs, lib.rs, error.rs, paths.rs
       config.rs, seed.rs, locale.rs
       catalog.rs, help_parser.rs
       command.rs, launch.rs
       fstree.rs, folderinfo.rs, sessions.rs
       history.rs, secrets.rs
       skills.rs, project.rs
       integration/{mod.rs, tray.rs, shortcut.rs, explorer.rs, notify.rs}
       commands.rs        all #[tauri::command] wrappers
skills-repo-template/
docs/, .github/
```

## Shared types (Rust serde `rename_all = "camelCase"`, mirrored in `src/api.ts`)

```rust
pub enum Target { Wt, Powershell, Wsl }            // serde: "wt" | "powershell" | "wsl"
pub type Selection = BTreeMap<String, Option<String>>; // active option id -> value (None for valueless)
pub struct Profile { id: String, name: String, builtin: bool, selection: Selection, target: Target }
pub struct HistoryEntry { at: String /*RFC3339*/, path: String, profile: Option<String>, target: Target, selection: Selection, preview: String }
pub struct Branding { logo_path: Option<String>, tray_icon_path: Option<String>, primary_color: Option<String> }
pub struct Updates { mode: String /*"auto"|"notify"|"manual"*/, endpoint: Option<String> }
pub struct AppConfig {
  version: u32 /*=1*/, language: Option<String>, theme: String /*"system"*/, root_folder: String,
  show_hidden: bool, nav_collapsed: bool, close_to_tray: bool /*true*/, autostart: bool, shortcut: String,
  default_target: Target, skills_repo_url: String /*""*/, explorer_menu: bool, updates: Updates, branding: Branding,
  pinned: Selection, favorites: Vec<String>, recents: Vec<String> /*max 10, newest first*/,
  profiles: Vec<Profile>, active_profile: Option<String>, folder_profiles: BTreeMap<String,String>,
  history: Vec<HistoryEntry> /*max 200, newest first*/, first_run_done: bool
}
pub struct ValueSpec { kind: String /*"none"|"select"|"text"|"fixed"|"secret"*/, options: Vec<String>, fixed: Option<String>, placeholder: Option<String> }
pub struct I18nText { d: String, t: String }      // short description, tooltip
pub struct CatalogItem { id: String, kind: String /*"flag"|"env"*/, key: String, group: String /*"model"|"perm"|"ctx"|"dbg"|"other"*/, value: ValueSpec, dangerous: bool, from_help: bool, i18n: BTreeMap<String, I18nText> /*es,en,zh*/ }
pub struct LaunchRequest { path: String, target: Target, selection: Selection, resume_id: Option<String> }
pub struct LaunchPlan { preview: String, program: String, args: Vec<String>, script: Option<String>, cwd: String }
pub struct DirEntry { name: String, path: String, has_children: bool, hidden: bool }
pub struct DriveEntry { path: String, label: String, kind: String /*"fixed"|"removable"|"network"|"other"*/ }
pub struct FolderInfo { path: String, exists: bool, git_branch: Option<String>, has_claude_md: bool, skills_count: u32, sessions_count: u32, last_session_at: Option<String> }
pub struct SessionSummary { id: String, modified_at: String, title: String }
pub struct SkillInfo { name: String, description: String, hash: String }
pub struct InstalledSkill { name: String, hash: String, update_available: bool }
pub struct TemplateInfo { id: String, name: String }
pub struct NewProjectRequest { parent: String, name: String, template: Option<String>, description: String, stack: String, skills: Vec<String>, skills_scope: String /*"project"|"global"*/, git_init: bool, gitignore: bool, notify_hook: bool }
pub struct AppError { code: String, message: String }   // serialized to UI; code is an i18n key suffix
```

## Tauri command list (names are final; implemented in the task noted)

`ping`(T2) · `get_config`, `save_config`, `system_locale`, `export_config`, `import_config`(T2) · `get_catalog`(T3) · `build_command`, `launch`(T4) · `list_dir`, `list_roots`, `folder_info`, `list_sessions`(T5) · `secret_set`, `secret_has`, `secret_delete`(T6) · `skills_sync`, `skills_list`, `templates_list`, `skills_installed`, `skills_install`, `create_project`(T7) · `open_vscode`, `open_explorer`, `set_autostart`, `set_shortcut`, `set_explorer_menu`, `refresh_tray`, `notify`(T12). Events emitted to UI: `navigate` (payload view id), `open-path` (path string), `language-changed` (lang).

---

### Task 1: Scaffold the Tauri + React project

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src-tauri/**` (via `npm create tauri-app` equivalent, then edit), `.gitignore`, `LICENSE` (full GPLv3 text from https://www.gnu.org/licenses/gpl-3.0.txt), `src-tauri/icons/*`, `assets/branding/app-icon.svg`, `src-tauri/src/error.rs`, `src-tauri/src/paths.rs`.

**Interfaces:**
- Produces: `paths::config_dir() -> PathBuf` (`%APPDATA%\iDeo\LanzadorClaude`, created if missing), `paths::local_dir() -> PathBuf` (`%LOCALAPPDATA%\iDeo\LanzadorClaude`), `paths::claude_home() -> PathBuf` (`%USERPROFILE%\.claude`); all three honour env override `LANZADOR_TEST_HOME` (when set, everything lives under it) for tests. `error::AppError` with `impl From<std::io::Error>`, `serde::Serialize`, constructor `AppError::new(code, message)`, and `pub type AppResult<T> = Result<T, AppError>`.
- npm scripts: `dev`, `build`, `test` (vitest run), `typecheck`, `tauri`.

- [ ] Step 1: Scaffold with `npm create tauri-app@latest` (React + TS, npm) into a temp dir in the scratchpad and move files into the repo root (repo already has `docs/`, `assets/`, `.superpowers/`). Set productName/identifier/version from Global Constraints; window 1280×800, min 960×640, title "Lanzador Claude", `decorations: true`.
- [ ] Step 2: Add deps: `zustand`, `@fontsource/roboto`, `@fontsource/roboto-mono`, `@tauri-apps/api`, plugin JS packages listed in Tech Stack; dev: `vitest`, `@testing-library/react`, `jsdom`. Rust: add the plugin crates and crates from Tech Stack to `src-tauri/Cargo.toml` (plugins registered in Task 12 — for now only `opener`, `dialog`).
- [ ] Step 3: `.gitignore` must include `node_modules/`, `dist/`, `src-tauri/target/`, `.superpowers/`, `*.key`.
- [ ] Step 4: Create `assets/branding/app-icon.svg`: 1024×1024 rounded square `#006EB3` with the white logo `assets/branding/logo-iDeo-blanco-Servicios-Informaticos-Premium.svg` centered (scaled to ~80% width). Run `npx tauri icon assets/branding/app-icon.svg` to produce `src-tauri/icons/*`. Copy both logo SVGs to `src/assets/`.
- [ ] Step 5: Write `paths.rs` + `error.rs` with unit test `paths_honour_test_home` (set `LANZADOR_TEST_HOME` to a tempdir, assert `config_dir()` starts with it and exists).
- [ ] Step 6: Verify: `cd src-tauri && cargo test` PASS; `npm run typecheck` PASS; `npm run tauri build -- --debug --no-bundle` produces `src-tauri/target/debug/lanzador-claude.exe`.
- [ ] Step 7: Commit `chore: scaffold Tauri 2 + React app`.

### Task 2: Config, installer seed, locale, ping

**Files:** Create `src-tauri/src/config.rs`, `seed.rs`, `locale.rs`, `commands.rs` (start it); modify `lib.rs`.

**Interfaces:**
- Consumes: `paths::config_dir`, `AppError`.
- Produces: `config::load() -> AppConfig`, `config::save(&AppConfig) -> AppResult<()>` (atomic: write `config.json.tmp` then rename), `AppConfig::default()` (includes the three builtin profiles from spec §4.5 with ids `safe`, `auto`, `ps-opus`), `config::push_recent(&mut AppConfig, path)`, `config::push_history(&mut AppConfig, HistoryEntry)`; `seed::read_seed() -> Option<Seed{autostart: bool, profile: Option<String>, pinned: Vec<String>}>` and `seed::apply(&mut AppConfig, Seed)` (pinned ids get value from catalog default/fixed — pass `None`; profile id selection merged into `pinned`); `locale::detect() -> String` (`es*`→`es`, `zh*`→`zh`, else `en`). Commands: `ping() -> {ok: bool, version: String}`, `get_config`, `save_config(config)`, `system_locale`, `export_config(path)`, `import_config(path) -> AppConfig`. `get_config` on first run (no file) applies the seed then sets `first_run_done = true` and saves.

- [ ] Step 1: Tests in `config.rs`: `default_has_builtin_profiles` (ids safe/auto/ps-opus; `ps-opus` selection contains `env.CLAUDE_CODE_USE_POWERSHELL_TOOL`→`Some("1")` and `flag.model`→`Some("opus")`); `corrupt_file_is_backed_up` (write `{not json`, `load()` returns default and `config.json.bak` exists); `missing_fields_default` (write `{"version":1,"rootFolder":"D:\\X"}` → root `D:\X`, shortcut `Ctrl+Alt+I`); `recents_dedup_and_cap` (push 12 paths incl. a repeat → len 10, newest first, no dupes, case-insensitive compare); `history_cap_200`. Tests in `locale.rs`: `maps_locales` for `es-ES`,`es-MX`,`zh-CN`,`zh-TW`,`en-US`,`fr-FR` → es,es,zh,zh,en,en (use a pure `map_locale(&str)`). Seed: `seed_apply_merges_profile_and_pinned` (pure, no registry).
- [ ] Step 2: Run `cargo test` → FAIL. Step 3: implement (`#[serde(default)]` on struct; option ids are `flag.<name>` / `env.<NAME>` — see Task 3). Step 4: `cargo test` PASS.
- [ ] Step 5: Commit `feat(engine): config, seed and locale`.

### Task 3: Catalog of flags and env vars

**Files:** Create `src-tauri/resources/catalog.json`, `src-tauri/src/catalog.rs`, `src-tauri/src/help_parser.rs`.

**Interfaces:**
- Produces: option id convention `flag.<long-name-without-dashes>` (e.g. `flag.model`, `flag.permission-mode`) and `env.<NAME>`. `catalog::load_embedded() -> Vec<CatalogItem>` (`include_str!`), `help_parser::parse(help: &str) -> Vec<(String /*--flag*/, bool /*takes value*/, String /*description*/)>`, `catalog::merge_help(items, parsed) -> Vec<CatalogItem>` (adds unknown flags as `group:"other"`, `from_help:true`, en text from help copied to all three langs; skips `--help`, `--version`, `--print` and any flag whose description contains "only works with --print"). Command `get_catalog(include_help: bool)` runs `claude --help` (5 s timeout, `CREATE_NO_WINDOW`), falls back to embedded only on error.
- Catalog content (interactive flags from `docs/reference/claude-help.txt`): model(select: fable, opus, sonnet, haiku), effort(select low..max), continue, resume(text, placeholder "id o nombre"), name(text), fork-session, permission-mode(select: manual, acceptEdits, plan, auto, dontAsk, bypassPermissions), dangerously-skip-permissions(dangerous), allow-dangerously-skip-permissions(dangerous), allowed-tools(text), disallowed-tools(text), add-dir(text, `;`-separated paths), append-system-prompt(text), system-prompt(text), mcp-config(text), strict-mcp-config, settings(text), setting-sources(text), plugin-dir(text), agent(text), ide, chrome, no-chrome, worktree(text optional), remote-control, safe-mode, bare, restricted, autocompact(text), fallback-model(text), verbose, debug(text optional), debug-file(text), ax-screen-reader. Env vars: the list in spec §4.3; `ANTHROPIC_API_KEY` uses `kind:"secret"`; `CLAUDE_CODE_USE_POWERSHELL_TOOL`, `DISABLE_*`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` use `kind:"fixed"`, `fixed:"1"`. All entries have es/en/zh `d` (≤60 chars) and `t` (1–2 sentences) written by the implementer; reuse the mockup texts where they exist.

- [ ] Step 1: Tests: `embedded_catalog_valid` (parses; ids unique; every item has es/en/zh non-empty d and t; select items have ≥1 option; fixed items have `fixed`); `parser_reads_flags` on the saved help text (`include_str!("../../docs/reference/claude-help.txt")`): finds `--model` takes value, `--continue` no value, `--add-dir` takes value; `merge_skips_print_only` (`--output-format` absent, an invented `--brand-new-flag` present with group `other`).
- [ ] Step 2–4: fail → implement → pass. Step 5: Commit `feat(engine): flag and env catalog`.

### Task 4: Command builder and launcher (critical)

**Files:** Create `src-tauri/src/command.rs`, `src-tauri/src/launch.rs`.

**Interfaces:**
- Consumes: `CatalogItem`, `Selection`, `LaunchRequest`, `secrets::get(key) -> Option<String>` (Task 6; until then a trait/closure param so tests inject secrets).
- Produces: `command::plan(req: &LaunchRequest, catalog: &[CatalogItem], secret: &dyn Fn(&str)->Option<String>, pwsh: &str) -> AppResult<LaunchPlan>`; `launch::run(plan: &LaunchPlan) -> AppResult<()>`; commands `build_command(req) -> String` (preview) and `launch(req) -> HistoryEntry` (also pushes recent + history and saves config).
- Rules:
  - Order: env vars (catalog order) then `claude`, then flags (catalog order), then `--resume <id>` if `resume_id` set (overrides `flag.resume`/`flag.continue`).
  - Flag values: `select`/`text` → `--flag value`; `add-dir` splits on `;` into repeated values; optional-value flags with empty value → bare flag; `none` → bare flag. Ids not in catalog are ignored.
  - PowerShell quoting `ps_quote(s)`: if `s` matches `^[A-Za-z0-9_\-./:=,@+]+$` keep; else `'` + s.replace("'", "''") + `'`.
  - Script (targets `wt`, `powershell`): UTF-8 with BOM, lines: `Remove-Item -LiteralPath $PSCommandPath -ErrorAction SilentlyContinue`, `Set-Location -LiteralPath <ps_quote(path)>`, one `$env:K = <ps_quote(v)>` per env, then `claude <args>`. Saved to `paths::local_dir()/launch/<unix_millis>.ps1`.
  - `wt`: program `wt.exe`, args `["-d", path, pwsh, "-NoExit", "-ExecutionPolicy", "Bypass", "-File", script_path]`. `powershell`: program `pwsh`, same args without `wt`/`-d`, spawned with `CREATE_NEW_CONSOLE`, `cwd=path`. `wsl`: program `wt.exe`, args `["-d", path, "wsl.exe", "--cd", path, "--", "env", "K=V"..., "claude", flags...]` with every `;` in any arg escaped as `\;` (wt separator); no script.
  - `pwsh`: `"pwsh"` if `where pwsh` succeeds else `"powershell"` (resolved once, cached).
  - Preview: `PS <path>> ` + env assignments joined `; ` + `; claude ...` for wt/powershell; for wsl `wsl> env K=V claude ...`. Secrets shown as `'••••'`. Preview and script are built from the same token list.
  - `path` must exist and be a directory, else `AppError("path_not_found")`.
- [ ] Step 1: Tests: `orders_env_then_flags`; `quotes_spaces_apostrophes_semicolons` (path `C:\Proyectos\José's app; v2` → script contains `Set-Location -LiteralPath 'C:\Proyectos\José''s app; v2'`); `wt_args_shape`; `wsl_escapes_semicolon`; `add_dir_splits`; `secret_hidden_in_preview_present_in_script`; `resume_id_overrides_continue`; `unknown_ids_ignored`; `missing_path_errors` (use tempdir for existing paths).
- [ ] Step 2–4: fail → implement → pass. Step 5: manual smoke (implementer): `cargo test` only; real launch is verified in Task 9.
- [ ] Step 6: Commit `feat(engine): command builder and launcher`.

### Task 5: Folder tree, folder info, sessions

**Files:** Create `src-tauri/src/fstree.rs`, `folderinfo.rs`, `sessions.rs`.

**Interfaces:**
- Produces: `fstree::list_dir(path, show_hidden) -> AppResult<Vec<DirEntry>>` (directories only, sorted case-insensitive, `has_children` = first `read_dir` yields any directory — cap the probe at 200 entries; entries that fail metadata are skipped; reparse points (junctions/symlinks) listed but `has_children=false` to avoid loops; hidden = Windows HIDDEN|SYSTEM attribute or name starts with `.` only when `show_hidden` false filters them); `fstree::list_roots() -> Vec<DriveEntry>` (GetLogicalDrives + GetDriveTypeW + GetVolumeInformationW label, via `windows-sys`); `sessions::encode_project_dir(path) -> String` (every char not ASCII alphanumeric → `-`, e.g. `C:\Desarrollo\IDNLanzador` → `C--Desarrollo-IDNLanzador`); `sessions::list(path) -> Vec<SessionSummary>` (files `*.jsonl` in `claude_home()/projects/<encoded>`, newest first; title = first line with `"type":"user"` whose `message.content` is a string, trimmed to 80 chars, else id); `folderinfo::info(path) -> FolderInfo` (`git_branch` from `.git/HEAD` `ref: refs/heads/<b>` or short sha; walks up to find `.git` max 10 levels; `skills_count` = subdirs of `.claude/skills`).
- [ ] Step 1: Tests with tempdirs + `LANZADOR_TEST_HOME`: `lists_only_dirs_sorted`; `hides_dot_dirs_unless_show_hidden`; `unreadable_entry_skipped` (simulate by including a broken symlink/junction if creatable, else a dir whose metadata fails — mark `#[cfg(windows)]`); `missing_root_is_error` (code `path_not_found`); `encode_matches_claude` (`C:\Desarrollo\IDNLanzador`→`C--Desarrollo-IDNLanzador`); `sessions_title_and_order`; `git_branch_from_head`; `info_counts_skills`.
- [ ] Step 2–4. Step 5: Commit `feat(engine): folder tree, folder info and sessions`.

### Task 6: Secrets and command registration of engine modules

**Files:** Create `src-tauri/src/secrets.rs`; modify `commands.rs`, `lib.rs` (register all commands from Tasks 2–6 in `invoke_handler`).

**Interfaces:** `secrets::set(key, value) -> AppResult<()>`, `secrets::get(key) -> Option<String>`, `secrets::has(key) -> bool`, `secrets::delete(key) -> AppResult<()>` (keyring service `LanzadorClaude`, user = key). Commands `secret_set`, `secret_has`, `secret_delete`. `launch` command wires `secrets::get` into `command::plan`.
- [ ] Step 1: Test `roundtrip_secret` (`#[ignore]`-free but uses key `__test__<random>` and deletes it). Step 2–4. Step 5: `npm run tauri build -- --debug --no-bundle` compiles. Commit `feat(engine): secrets and command registration`.

### Task 7: Skills repository and project creation

**Files:** Create `src-tauri/src/skills.rs`, `src-tauri/src/project.rs`, `src-tauri/resources/claude-md-default.md`.

**Interfaces:**
- Produces: `skills::repo_dir() -> PathBuf`; `skills::sync(url, token: Option<String>) -> AppResult<String>` (if repo dir has `.git`: `git -C <dir> pull --ff-only`; else `git clone --depth 1 <url> <dir>`; token injected as `https://<token>@host/...` only in the process args, never saved; errors mapped to codes `git_missing`, `repo_url_empty`, `git_failed` with stderr in message); `skills::list() -> Vec<SkillInfo>` (`skills/*/SKILL.md`, description from YAML front-matter `description:`); `skills::templates() -> Vec<TemplateInfo>` (`templates/claude-md/*.md` + builtin id `default`); `skills::hash_dir(dir) -> String` (sha256 over sorted relative paths + contents, hex first 16); `skills::installed(project: &Path) -> Vec<InstalledSkill>`; `skills::install(names, dest: &Path) -> AppResult<()>` (copy `skills/<n>` → `<dest>/<n>`, overwrite); `project::create(req: &NewProjectRequest, exe_path: &Path) -> AppResult<PathBuf>`: validates name (no `<>:"/\|?*`, not empty, not existing → codes `invalid_name`, `already_exists`), creates folder, renders template replacing `{{name}}`, `{{description}}`, `{{stack}}`, `{{date}}` (YYYY-MM-DD) into `CLAUDE.md`, installs skills to `<project>/.claude/skills` or `claude_home()/skills`, optional `.gitignore` (generic: `node_modules/`, `target/`, `dist/`, `.env`, `.superpowers/`), optional `git init -b main` (failure → warning, not error), optional notify hook writing `<project>/.claude/settings.json` with `{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"\"<exe>\" --notify \"<name>: Claude ha terminado\""}]}]}}`. Skills install failure after the folder exists returns Ok with the path and a warning list: return type `AppResult<CreateResult{path: String, warnings: Vec<String>}>` (add `CreateResult` to api.ts).
- Commands: `skills_sync`, `skills_list`, `templates_list`, `skills_installed(path)`, `skills_install(path: Option<String>, names)`, `create_project(req) -> CreateResult`.
- [ ] Step 1: Tests (tempdirs; create a local bare git repo fixture with `git init` + commit in test when `git` is available, skip otherwise with a printed note): `sync_clones_local_repo`; `empty_url_errors`; `lists_skills_with_description`; `hash_changes_with_content`; `installed_reports_update_available`; `create_renders_template`; `create_rejects_bad_names`; `create_without_git_still_ok` (PATH emptied for the git call via an injectable git program name); `notify_hook_written`.
- [ ] Step 2–4. Step 5: Commit `feat(engine): skills repo and project creation`.

### Task 8: UI foundation — tokens, i18n, store, shell

**Files:** Create `src/styles/tokens.css`, `src/styles/app.css`, `src/i18n/*`, `src/api.ts`, `src/store.ts`, `src/logic/checkboxes.ts`, `src/logic/selection.ts`, `src/components/{TopBar,NavRail,StatusBar,Toast}.tsx`, `src/App.tsx`; tests `src/__tests__/{checkboxes,i18n,selection}.test.ts`.

**Interfaces:**
- `api.ts`: one exported async function per Tauri command (camelCase names: `ping()`, `getConfig()`, …) + all shared TS types.
- `logic/checkboxes.ts`: `type OptState = { active: Selection; pinned: Selection }`; `togglePin(s, id, value: string|null): OptState`; `toggleActive(s, id, value): OptState`; `setValue(s, id, value): OptState` (activates; if pinned updates pinned value); `initialActive(pinned): Selection` — rules exactly spec §4.2.
- `logic/selection.ts`: `applyProfile(profile) -> OptState` (active = profile.selection, pinned unchanged), `countByKind(active, catalog, kind)`.
- `i18n/index.ts`: `t(key, vars?)`, `useT()` hook, `setLanguage(lang)`, detection = `config.language ?? systemLocale()`. Keys nested JSON; `es.json` is the source of truth.
- `store.ts` (zustand): `config`, `catalog`, `opt: OptState`, `selectedPath`, `view` (`launch|new|profiles|skills|history|settings`), `engineUp`, actions `load()`, `saveConfig(patch)`, `selectPath(p)`, `setView(v)`.
- Shell: layout from mockup (top bar, nav rail collapsible persisted in `config.navCollapsed`, main area, status bar). Theme: `data-theme` on `<html>` from `config.theme` (`system` → no attribute). Status bar calls `ping()` every 5000 ms; shows `status.connected` / `status.disconnected` (green/red dot) + version.
- [ ] Step 1: Tests: checkbox rules (5 cases, one per bullet in §4.2 + `initialActive` = pinned); `i18n_keys_match` (es/en/zh have identical key sets and no empty strings); `applyProfile_keeps_pins`.
- [ ] Step 2–4: `npm test` fail → implement → pass; `npm run typecheck` PASS. Step 5: `npm run tauri dev` smoke: window shows shell, status bar turns "Conectado al motor". Commit `feat(ui): foundation, i18n and shell`.

### Task 9: Launch view

**Files:** Create `src/components/{FolderTree,FolderInfo,OptionsPanel,OptionRow,CommandFooter,SearchPalette}.tsx`, `src/views/LaunchView.tsx`.

**Interfaces:** Consumes store + api (`listDir`, `listRoots`, `folderInfo`, `listSessions`, `getCatalog`, `buildCommand`, `launch`, `openVscode`, `openExplorer`).
- FolderTree: recents/favorites chips (favorite toggle via context menu + star), root node from `config.rootFolder` (error row if `list_dir` fails), "Este equipo" node with `listRoots()`, lazy expand, keyboard (↑↓←→ Enter), "Cambiar raíz" uses dialog plugin folder picker, "mostrar ocultas" toggle in tree header menu.
- FolderInfo: badges and "Continuar última" (launch with `flag.continue` added) / "Reanudar…" dropdown of `listSessions` (launch with `resumeId`).
- OptionsPanel: tabs Parámetros/Variables with counts, target select, profile select + "Guardar como perfil…" (inline name input, no `prompt()`), grouped rows. OptionRow: pin + active checkboxes (purple left, blue right), key in mono with tooltip (hover/focus, 300 ms delay), description, value control (`select`/`text`/`fixed`/`secret` → password field that calls `secretSet` on blur and stores `@secret` as value).
- CommandFooter: preview from `buildCommand` (debounced 150 ms), Copiar (clipboard + toast), VS Code, Iniciar (calls `launch`, toast `toast.launched`, error toast with localized code).
- SearchPalette: Ctrl+K overlay; searches favorites, recents and the root's first two levels (cached `listDir`); Enter selects.
- Pinned changes persist immediately to `config.pinned` via `saveConfig`.
- [ ] Step 1: Test `src/__tests__/footer.test.tsx`: rendering `CommandFooter` with mocked `api.buildCommand` shows returned preview; clicking Iniciar calls `api.launch` with current path/target/selection.
- [ ] Step 2–4. Step 5: Manual: `npm run tauri dev`, select `C:\Desarrollo\IDNLanzador`, tick `--model opus` + `CLAUDE_CODE_USE_POWERSHELL_TOOL`, Iniciar → Windows Terminal opens in that folder running Claude. Also test a folder with a space and apostrophe. Commit `feat(ui): launch view`.

### Task 10: Profiles, History, Settings, About

**Files:** Create `src/views/{ProfilesView,HistoryView,SettingsView}.tsx`, `src/components/AboutDialog.tsx`.
- Profiles: list (builtins marked, not deletable), create from current selection, rename, delete, apply (→ launch view), per-folder default profile toggle (`config.folderProfiles`).
- History: table (date local format, folder, profile, target, preview mono), "Relanzar" (calls `launch` with the entry's request), "Limpiar historial" with inline confirm.
- Settings sections per spec §4.8; branding: pick SVG/PNG for logo and ICO/PNG for tray (dialog plugin), color input; logo rendered in TopBar from file (`convertFileSrc`); "Restablecer marca". Export/import via save/open dialogs. Shortcut field captures keys (records combo), calls `setShortcut` and shows error inline if it fails. Autostart/explorer menu toggles call their commands (Task 12; until then no-op wrappers that resolve).
- AboutDialog: exact content spec §4.9 and mockup story text (the four sections, all three languages, "iDeo" words linked to https://ideonetworks.com, Madrid → Maps URL). Links open with opener plugin. Phone copy button. WhatsApp from constant `WHATSAPP_URL = ""` → shows "Próximamente" when empty.
- [ ] Step 1: Test `about.test.tsx`: renders links with exact hrefs (home, product page, maps) and phone text `+34 911 29 29 39`; WhatsApp shows soon text when constant empty.
- [ ] Step 2–4. Commit `feat(ui): profiles, history, settings and about`.

### Task 11: New project wizard and Skills view

**Files:** Create `src/views/NewProjectView.tsx`, `src/views/SkillsView.tsx`.
- Wizard 4 steps (spec §4.6) with stepper, validation messages from engine error codes, final screen with warnings list and buttons "Abrir con Claude ahora" (launch with current selection) / "Ver en el árbol".
- Skills view: repo URL status + "Sincronizar" (shows result/error), list of skills with description, install to selected project or global, installed list for selected project with "Actualizar" when `updateAvailable`.
- Wizard skills step shows "Configura un repositorio de skills en Ajustes" link when URL empty.
- [ ] Step 1: Test `wizard.test.tsx`: cannot advance from step 1 with empty name; submitting calls `api.createProject` with the composed request.
- [ ] Step 2–4. Commit `feat(ui): new project wizard and skills`.

### Task 12: Windows integration

**Files:** Create `src-tauri/src/integration/{mod.rs,tray.rs,shortcut.rs,explorer.rs,notify.rs}`; modify `lib.rs`, `capabilities/default.json`, `tauri.conf.json`.
- Plugins registered: single-instance (forward args to `handle_args`), autostart (`--minimized` arg), global-shortcut, updater, notification, process.
- `handle_args(app, args)`: `--open <path>` → show window + emit `open-path`; `--notify <text>` → system notification titled "Lanzador Claude" then exit if it was a fresh instance; `--minimized` → start hidden in tray.
- Tray (`tray.rs`): icon from `config.branding.trayIconPath` or default; menu per spec §4.10 with recents (max 8) submenu and language submenu (es/en/zh labels in their own language); labels translated with a small Rust-side dictionary for the tray only (`tray_labels(lang)`); `refresh_tray` command rebuilds it. Left click toggles window.
- Close button: if `closeToTray` → hide window; else exit.
- `set_shortcut(combo)`: unregister old, register new; returns `AppError("shortcut_taken")` on failure. Registered at startup from config.
- `explorer.rs`: `set_explorer_menu(enabled)` writes/removes `HKCU\Software\Classes\Directory\shell\LanzadorClaude` (+ `Directory\Background\shell\LanzadorClaude`), `(Default)`="Abrir con Claude", `Icon`=exe, `command`=`"<exe>" --open "%V"`.
- `set_autostart(enabled)` via autostart plugin.
- Updater: on startup if `updates.mode != "manual"` check; `notify` mode → emit `update-available` {version, notes} handled by a UI banner (add to App.tsx) with "Actualizar"/"Más tarde"; `auto` → download + install + restart. `tauri.conf.json` `plugins.updater.endpoints = ["https://github.com/ideonetworks/lanzador-claude/releases/latest/download/latest.json"]`, `pubkey` from generated key (Task 14 documents generation; generate now with `npx tauri signer generate -w %USERPROFILE%\.tauri\lanzador-claude.key` without password, put public key in config, never commit the private key).
- [ ] Step 1: Rust tests: `tray_labels_all_langs` (non-empty for es/en/zh); `explorer_command_string` (pure fn building the command value with quoting); `parse_args` (pure fn → enum `Arg::Open(path)|Notify(text)|Minimized`).
- [ ] Step 2–4. Step 5: Manual: tray menu works, Ctrl+Alt+I toggles, second launch focuses, `lanzador-claude.exe --notify "test"` shows toast. Commit `feat(engine): tray, shortcut, autostart, explorer menu, updater`.

### Task 13: Installers with seed options

**Files:** Create `src-tauri/windows/nsis/installer-hooks.nsh`, `src-tauri/windows/wix/seed-fragment.wxs`; modify `tauri.conf.json` (`bundle.targets: ["nsis","msi"]`, `bundle.windows.nsis.installerHooks`, `bundle.windows.nsis.languages: ["Spanish","English","SimpChinese"]`, `displayLanguageSelector: true`, `bundle.windows.wix.fragmentPaths`, `componentRefs`, `bundle.windows.webviewInstallMode: {type:"downloadBootstrapper"}`, `bundle.createUpdaterArtifacts: true`, publisher "iDeo Networks", license file).
- NSIS: custom nsDialogs page (inserted via hooks/`!macro` page) with: checkbox "Arrancar con Windows"; radio group profile (Ninguno/Seguro/Autónomo/PowerShell + Opus → `""|safe|auto|ps-opus`); 8 checkboxes from spec §4.12 mapped to ids `flag.model` (value opus → written as `flag.model=opus`), `flag.continue`, `flag.permission-mode=auto`, `flag.ide`, `flag.verbose`, `env.CLAUDE_CODE_USE_POWERSHELL_TOOL`, `env.DISABLE_TELEMETRY`, `env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. Page texts in the 3 installer languages. On install writes `HKCU\Software\iDeo\LanzadorClaude\Seed`: `Autostart` DWORD, `Profile` SZ, `Pinned` SZ (`id[=value];…`). Update `seed.rs` to parse `id=value` pairs (adjust Task 2 test `seed_parses_pairs`).
- MSI: fragment with public properties `AUTOSTART` (default 0), `PROFILE`, `PINNED` → same registry values (HKCU, per-user install).
- Seed `Autostart=1` → app enables autostart on first run.
- [ ] Step 1: Rust test `seed_parses_pairs` (`"flag.model=opus;flag.continue"` → `{flag.model: Some(opus), flag.continue: None}`).
- [ ] Step 2: `npm run tauri build` produces `src-tauri/target/release/bundle/nsis/Lanzador Claude_0.1.0_x64-setup.exe` and `bundle/msi/Lanzador Claude_0.1.0_x64_*.msi`. If the updater private key env (`TAURI_SIGNING_PRIVATE_KEY`) is absent, set `createUpdaterArtifacts` handling so local builds don't fail (load key from file path in env if present).
- [ ] Step 3: Manual: run setup.exe, pick options, start app → pinned options appear ticked. Commit `feat(installer): NSIS and MSI with first-run seed`.

### Task 14: Public repository, CI and skills template

**Files:** Create `README.md` (es, with links), `README.en.md`, `README.zh-CN.md`, `CONTRIBUTING.md`, `NOTICE` (GPLv3 §7(b) additional term text: "Additional term under GPLv3 section 7(b): modified versions must preserve, in the application's About screen, the notice 'Desarrollado originalmente por iDeo (https://ideonetworks.com)'."), `TRADEMARKS.md` (iDeo name and logos excluded from the license), `PRIVACY.md` (no telemetry statement), `docs/firma-de-codigo.md` (SignPath Foundation steps; why self-signed doesn't help), `docs/actualizaciones.md` (updater key generation, GitHub secrets `TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD`, release by tag), `.github/workflows/ci.yml` (on PR/push: `npm ci`, `npm test`, `npm run typecheck`, `cargo test`, `cargo clippy -D warnings` on windows-latest), `.github/workflows/release.yml` (on tag `v*`: tauri-action matrix `x86_64-pc-windows-msvc`, `aarch64-pc-windows-msvc`, draft release with `latest.json`), `.github/ISSUE_TEMPLATE/{bug.yml,feature.yml}`, `skills-repo-template/` (`README.md`, `.claude-plugin/marketplace.json`, `skills/ideo-commit-style/SKILL.md`, `skills/ideo-readme-es/SKILL.md`, `templates/claude-md/default.md`, `templates/claude-md/web.md`, `mcp/example.json`). Add to About/README the 7(b) attribution line visibly.
- [ ] Step 1: Verify `actionlint` not required; validate YAML parses with `npx yaml-lint` or `node -e` + `yaml` package. Step 2: Commit `docs: public repo, CI and skills template`.

### Task 15: Final verification

- [ ] `cargo test`, `cargo clippy -- -D warnings`, `npm test`, `npm run typecheck` all PASS.
- [ ] `npm run tauri build` produces both installers.
- [ ] Whole-branch code review (superpowers:requesting-code-review), fix findings, commit.
