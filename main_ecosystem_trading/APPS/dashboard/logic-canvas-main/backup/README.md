# Protection Guide - Prevent Build Breakage

## What This Folder Contains

- `Cargo.lock.backup` - Backup of working dependency versions
- This README - Instructions for recovery

## Safe Commands (Can Run Anytime)

- `cargo build` - Incremental build
- `cargo check` - Verify code compiles
- `npm install` - Install node packages
- `npm run tauri:dev` - Run the app

## Dangerous Commands (BACKUP FIRST)

- `cargo clean` - Deletes compiled cache (takes 30+ min to rebuild)
- `cargo update` - Changes dependency versions (CAN BREAK BUILD)
- `rustup default X` - Changes Rust version (CAN BREAK BUILD)
- Deleting `Cargo.lock` - NEVER DO THIS

## Recovery Instructions

If build breaks:

1. Delete broken target folders:
   ```
   rmdir /s /q src-tauri\target
   rmdir /s /q src-tauri\target_*
   ```

2. Restore Cargo.lock:
   ```
   copy /Y backup\Cargo.lock.backup src-tauri\Cargo.lock
   ```

3. Rebuild:
   ```
   cd src-tauri
   cargo build --lib
   cd ..
   npm install
   npm run tauri:dev
   ```

## If npm Breaks

1. Delete node_modules:
   ```
   rmdir /s /q node_modules
   npm install
   ```

## If Cargo Cache Corrupts

1. Run chkdsk:
   ```
   chkdsk D: /f /r
   ```

2. Reboot

3. Delete cache and rebuild:
   ```
   rmdir /s /q src-tauri\target
   cd src-tauri
   cargo build --lib
   ```

## Prevention Checklist

- [x] rust-toolchain.toml created (pins Rust version)
- [x] Cargo.lock backed up
- [ ] After major changes, backup target/ folder (optional, saves rebuild time)

## The Golden Rule

**Never run `cargo update` or delete `Cargo.lock` without a backup.**
