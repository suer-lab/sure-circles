use soroban_sdk::{panic_with_error, Env};

use crate::{Circle, DataKey, Error};

/// Minimum remaining TTL (in ledgers) that triggers an `extend_ttl` call.
///
/// Every write entrypoint that touches state (`create_circle`, `fund`,
/// `claim`, `cancel_circle`, `expire_round`, `propose_admin`, `accept_admin`)
/// calls `extend_ttl(LEDGER_THRESHOLD, LEDGER_EXTEND_TO)` on the entries it
/// writes. The Soroban host only performs the extension when the entry's
/// current TTL has fallen below `LEDGER_THRESHOLD`; if it is already higher,
/// the call is a no-op. Setting this to 100 ledgers (≈ 8 minutes at
/// ~5 s/ledger) means that any write performed in the last few minutes of a
/// circle's live window will refresh it to the full [`LEDGER_EXTEND_TO`]
/// budget.
///
/// This value only matters for entries that are being touched. A circle that
/// sits idle longer than [`LEDGER_EXTEND_TO`] archives regardless of the
/// threshold (see ADR 004).
pub const LEDGER_THRESHOLD: u32 = 100;

/// TTL (in ledgers) that persistent and instance entries are extended to on
/// each write.
///
/// 500,000 ledgers × 5 s/ledger ≈ **29 days** of activity-triggered liveness.
///
/// # Network limits this was chosen against (re-check before mainnet)
///
/// Soroban's TTL ceilings are **network settings**, not protocol constants.
/// As of 2026-09 the Stellar docs / CLI cookbook report:
///
/// | Setting | Testnet / Mainnet (reported) | Wall-clock (~5 s/ledger) |
/// |---|---|---|
/// | `max_entry_ttl` | **535,679** ledgers | ≈ 31 days |
/// | `min_persistent_entry_ttl` | **4,096** ledgers (typical) | ≈ 5.7 hours |
///
/// Re-check live values with:
/// `stellar network settings` / Horizon
/// `https://horizon.stellar.org/` (mainnet) and
/// `https://horizon-testnet.stellar.org/` (testnet), or the
/// [extend-contract-wasm cookbook](https://developers.stellar.org/docs/tools/cli/cookbook/extend-contract-wasm).
/// If the network ceiling drops below this constant, every `extend_ttl` call
/// silently clamps to the ceiling — the contract assumes the wrong lifetime
/// with no error.
///
/// `LEDGER_EXTEND_TO` is intentionally set just below the documented
/// `max_entry_ttl` ceiling to leave a small safety margin while still giving
/// circles close to the maximum window.
///
/// [`Circle::round_deadline_ledgers`] is validated at create time to be
/// strictly less than this value (0 = "no deadline" is allowed), so a round
/// deadline can never outlive the Circle entry that `expire_round` needs.
///
/// If a circle goes dormant (no write entrypoint) for longer than this
/// window, its persistent entry will be archived. An operator must then
/// submit a `RestoreFootprintOp` (via `stellar contract restore`) before any
/// further interaction is possible. See `contracts/README.md §Storage
/// lifetime` and `docs/adr/004-storage-archival.md`.
pub const LEDGER_EXTEND_TO: u32 = 500_000;

// Compile-time sanity check: the threshold at which we re-extend must be
// strictly less than the target we extend to, or the extension can never
// make progress. Also pin that the extend target stays below the documented
// network max_entry_ttl (535_679) so a silent clamp cannot happen unnoticed.
const _: () = assert!(
    LEDGER_THRESHOLD < LEDGER_EXTEND_TO,
    "LEDGER_THRESHOLD must be strictly less than LEDGER_EXTEND_TO",
);
const _: () = assert!(
    LEDGER_EXTEND_TO < 535_679,
    "LEDGER_EXTEND_TO must stay strictly below documented max_entry_ttl (535_679)",
);

/// Load a [`Circle`] from persistent storage by its id.
///
/// Panics with [`Error::CircleNotFound`] if no circle is stored at `id`.
pub fn load_circle(env: &Env, id: u64) -> Circle {
    env.storage()
        .persistent()
        .get(&DataKey::Circle(id))
        .unwrap_or_else(|| panic_with_error!(env, Error::CircleNotFound))
}

/// Save a [`Circle`] to persistent storage and extend its TTL.
///
/// Also bumps the instance TTL (see [`bump_instance`]).
pub fn save_circle(env: &Env, id: u64, circle: &Circle) {
    let key = DataKey::Circle(id);
    env.storage().persistent().set(&key, circle);
    env.storage()
        .persistent()
        .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
    bump_instance(env);
}

/// Extend the instance-storage TTL.
///
/// Instance storage holds [`DataKey::NextCircleId`]; if the instance entry
/// is archived on a quiet network and later restored, `NextCircleId` would
/// reset to 0 and `create_circle` would silently overwrite circle 0.
/// Extending on every state-changing entrypoint ensures the counter outlives
/// quiet periods.
pub fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
}
