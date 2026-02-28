# Building Perp DEX

## Fix for `blake3` / `arrayref` / `digest` / `cfg_aliases` errors

If you see errors like:

- `can't find crate for arrayref` (in blake3)
- `can't find crate for digest`
- `feature edition2024 is required` (constant_time_eq / Cargo 1.84)
- `can't find crate for cfg_aliases` (in borsh)

do the following:

### 1. Use Anchor 0.31.1

`Anchor.toml` should have:

```toml
[toolchain]
anchor_version = "0.31.1"
```

So `anchor build` uses the same CLI as your `anchor-lang` 0.31.1 dependency.

### 2. Do not use a custom registry for dependency resolution

Remove or comment out the `[registry]` section in `Anchor.toml` so all crates are resolved from crates.io. For example, remove:

```toml
[registry]
url = "https://api.apr.dev"
```

### 3. Pin dependencies (if you regenerated `Cargo.lock`)

If you ran `rm Cargo.lock` or `cargo update`, run:

```bash
cargo update -p blake3 --precise 1.8.2
cargo update -p borsh@1.6.0 --precise 1.5.5
```

This keeps:

- `blake3` at 1.8.2 (avoids edition2024 and missing deps in 1.8.3+).
- `borsh` at 1.5.5 (avoids build-dependency issues in 1.6.0).

### 4. Clean build

```bash
rm -rf target
anchor build
```

---

## BPF stack limit (Liquidation instruction)

If the build fails with:

```text
Stack offset of 4104 exceeded max offset of 4096 ... Liquidation ... try_accounts
```

the `Liquidation` instruction has too many accounts for the BPF stack. To fix:

- Reduce the number of accounts (e.g. move some to `remaining_accounts` and resolve manually), or
- Split liquidation into multiple instructions with fewer accounts each.

---

## One-time setup summary

1. `Anchor.toml`: set `anchor_version = "0.31.1"` and remove `[registry]` if present.
2. If needed: `cargo update -p blake3 --precise 1.8.2` and `cargo update -p borsh@1.6.0 --precise 1.5.5`.
3. `rm -rf target && anchor build`.

Do not delete `Cargo.lock` unless you re-run the pin commands above after regenerating it.
