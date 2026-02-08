# MT4 Control Plane (Dashboard-First Workflow)

This project’s “clean” MT4 EA uses a matrix config that is loaded from a file (key=value lines). MT4 presets (`.set` via the Inputs tab) only apply to `input/extern` variables, so the dashboard needs to own config creation, validation, placement, and safety checks.

## Goals

- Dashboard is the primary workflow for building configs and validating them.
- MT4 becomes the execution engine (live trading + backtests), not the place where config is edited.
- No-trade scenarios become obvious (health report + validation).

## Hard Constraints (MT4 Sandbox Reality)

- MT4 cannot read arbitrary absolute paths from an EA.
- EAs can read files from:
  - `MQL4\\Files\\...` (local terminal data folder)
  - `Common\\Files\\...` (shared terminal folder, via `FILE_COMMON`)
- Tester “Inputs preset” does not populate internal arrays/structs unless the EA explicitly parses a file.

## Recommended Design Pattern

### 1) Fixed “active config” filename (removes the Inputs tab)

- Pick a constant config name that never changes, e.g. `ACTIVE.set`.
- Dashboard always overwrites that file.
- EA is installed once with `inp_SetFile=ACTIVE.set` (or uses a constant default).
- After that, you never type filenames again.

Optional upgrade:
- Dashboard writes a tiny pointer file `ACTIVE.ptr` containing the actual config name.
- EA reads the pointer and then loads the real file, enabling versioned configs while still keeping MT4 inputs constant.

### 2) Dashboard-side validation before export

Validate and show a red/green “Ready to Trade” badge:

- Keys applied count must be > 0
- At least 1 enabled logic direction exists (Start_* keys)
- Max orders, risk limits, allow buy/sell, and group mode are consistent
- First enabled logic (group/engine/logic/direction) is displayed

## Workflow Levels

### Today (Minimal)

- Dashboard exports the `.set` (matrix keys) and shows:
  - recommended target folder name (LOCAL vs COMMON)
  - the exact `inp_SetFile` string you should use
- EA prints `CONFIG HEALTH` on init so “no trades” is instantly diagnosable.

### Next Step (No Manual Copy)

- Dashboard copies the exported config into the MT4 Common Files folder automatically.
- Dashboard exports the same config to a fixed name (`ACTIVE.set`), so MT4 input never changes.

Implementation notes:
- Add a “MT4 Install Path” setting in the dashboard (stored locally).
- Use the dashboard backend to write to the selected folder and confirm file write succeeded.

### Ultimate (Control Plane)

- Dashboard can launch MT4 for:
  - strategy tester run
  - live execution
- Dashboard writes the tester `.ini` and points to the correct expert + parameters.
- Dashboard runs a lightweight “handshake” protocol with MT4:
  - EA writes a heartbeat/status file (or JSON) into Common Files
  - Dashboard reads it and shows “EA alive / config loaded / trading allowed / open orders / last error”
- Dashboard becomes the single source of truth:
  - Config versions, snapshots, and rollback
  - Safety locks (global pause, per-symbol pause, max-drawdown lock)

## Safety Defaults

- Fail-fast option: `inp_RequireConfig=1` for live accounts (prevents accidental defaults).
- Developer convenience option: `inp_AutoEnableDefaultPower=1` only for quick sandbox testing.

