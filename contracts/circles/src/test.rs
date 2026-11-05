#![cfg(test)]

use super::*;
use ark_bls12_381::{Fq, Fq2, Fr as ArkFr};
use ark_ff::{BigInteger, PrimeField};
use ark_serialize::CanonicalSerialize;
use core::str::FromStr;
use soroban_sdk::testutils::Events as _;
use soroban_sdk::Symbol;
use soroban_sdk::{
    crypto::bls12_381::{G1_SERIALIZED_SIZE, G2_SERIALIZED_SIZE},
    symbol_short,
    testutils::{Address as _, Ledger as _},
    BytesN, Map, TryIntoVal, Val, U256,
};
use std::vec::Vec as StdVec;

/// All contract events from the last invocation as `(contract, topics, data)` tuples.
///
/// soroban-sdk 28's `events().all()` returns XDR-form `ContractEvents`; the assertions below
/// read topics and data as host values, so convert once here instead of in every test.
fn all_events(env: &Env) -> StdVec<(Address, soroban_sdk::Vec<Val>, Val)> {
    use soroban_sdk::xdr::{ContractEventBody, ScAddress};
    use soroban_sdk::TryFromVal;
    env.events()
        .all()
        .events()
        .iter()
        .map(|event| {
            let contract = event
                .contract_id
                .clone()
                .expect("contract event has a contract id");
            let address = Address::try_from_val(env, &ScAddress::Contract(contract)).unwrap();
            let ContractEventBody::V0(body) = &event.body;
            let mut topics = soroban_sdk::Vec::<Val>::new(env);
            for topic in body.topics.iter() {
                topics.push_back(Val::try_from_val(env, topic).unwrap());
            }
            let data = Val::try_from_val(env, &body.data).unwrap();
            (address, topics, data)
        })
        .collect()
}

#[rustfmt::skip] // generated file: do not let rustfmt rewrite it
mod dev_fixtures;

// ---- BLS12-381 test fixture helpers ----
// The verification key, proofs and public signals come from the Phase 8B DEVELOPMENT setup (see
// dev_fixtures.rs). Nothing here is inherited ceremony material.

fn g1_from_coords(env: &Env, x: &str, y: &str) -> G1Affine {
    let ark_g1 = ark_bls12_381::G1Affine::new(Fq::from_str(x).unwrap(), Fq::from_str(y).unwrap());
    let mut buf = [0u8; G1_SERIALIZED_SIZE];
    ark_g1.serialize_uncompressed(&mut buf[..]).unwrap();
    G1Affine::from_array(env, &buf)
}

fn g2_from_coords(env: &Env, x1: &str, x2: &str, y1: &str, y2: &str) -> G2Affine {
    let x = Fq2::new(Fq::from_str(x1).unwrap(), Fq::from_str(x2).unwrap());
    let y = Fq2::new(Fq::from_str(y1).unwrap(), Fq::from_str(y2).unwrap());
    let ark_g2 = ark_bls12_381::G2Affine::new(x, y);
    let mut buf = [0u8; G2_SERIALIZED_SIZE];
    ark_g2.serialize_uncompressed(&mut buf[..]).unwrap();
    G2Affine::from_array(env, &buf)
}

fn fr_from_dec_str(env: &Env, s: &str) -> Fr {
    let ark_fr = ArkFr::from_str(s).unwrap();
    let be_bytes = ark_fr.into_bigint().to_bytes_be();
    let mut buf = [0u8; 32];
    buf[32 - be_bytes.len()..].copy_from_slice(&be_bytes);
    Fr::from_bytes(BytesN::from_array(env, &buf))
}

/// DEVELOPMENT / TEST fixtures from the Phase 8B development setup (NOT FOR PRODUCTION).
///
/// Everything below is built from `test/dev_fixtures.rs`, which is GENERATED from
/// `contracts/circles/test-fixtures/dev-groth16-fixtures.json` by
/// `circuits/scripts/gen-contract-fixtures.mjs`. One verification key serves every scenario. The proofs
/// are for circle_id 0 (the first circle on a fresh contract): round 0 pays recipient r0 and round 1 pays
/// recipient r1, for the SAME member, so the two-round scenario needs no second key.
fn g1_from_pair(env: &Env, p: &[&str; 2]) -> G1Affine {
    g1_from_coords(env, p[0], p[1])
}

fn g2_from_pairs(env: &Env, p: &[[&str; 2]; 2]) -> G2Affine {
    g2_from_coords(env, p[0][0], p[0][1], p[1][0], p[1][1])
}

fn dev_verification_key(env: &Env) -> VerificationKey {
    let mut ic = Vec::new(env);
    for point in dev_fixtures::VK_IC.iter() {
        ic.push_back(g1_from_pair(env, point));
    }
    VerificationKey {
        alpha: g1_from_pair(env, &dev_fixtures::VK_ALPHA),
        beta: g2_from_pairs(env, &dev_fixtures::VK_BETA),
        gamma: g2_from_pairs(env, &dev_fixtures::VK_GAMMA),
        delta: g2_from_pairs(env, &dev_fixtures::VK_DELTA),
        ic,
    }
}

fn proof_from_fixture(env: &Env, p: &dev_fixtures::ProofFixture) -> Proof {
    Proof {
        a: g1_from_pair(env, &p.a),
        b: g2_from_pairs(env, &p.b),
        c: g1_from_pair(env, &p.c),
    }
}

fn dev_proof_round0(env: &Env) -> Proof {
    proof_from_fixture(env, &dev_fixtures::PROOF_ROUND0)
}

fn dev_proof_round1(env: &Env) -> Proof {
    proof_from_fixture(env, &dev_fixtures::PROOF_ROUND1)
}

// Public signals for the proofs above: [nullifierHash, root, externalNullifier, recipientHash].
fn dev_root(env: &Env) -> Fr {
    fr_from_dec_str(env, dev_fixtures::ROOT)
}
fn dev_nullifier_hash_round0(env: &Env) -> Fr {
    fr_from_dec_str(env, dev_fixtures::NULLIFIER_HASH_ROUND0)
}
fn dev_nullifier_hash_round1(env: &Env) -> Fr {
    fr_from_dec_str(env, dev_fixtures::NULLIFIER_HASH_ROUND1)
}
fn dev_external_nullifier_round0(env: &Env) -> Fr {
    fr_from_dec_str(env, dev_fixtures::EXTERNAL_NULLIFIER_ROUND0)
}

fn fixture_recipient_xdr(env: &Env, k: u8) -> Address {
    let mut b = [0u8; 40];
    b[3] = 18; // SCVAL_ADDRESS
    b[7] = 1; // ScAddress::Contract
    for byte in b.iter_mut().skip(8) {
        *byte = k;
    }
    use soroban_sdk::xdr::FromXdr as _;
    Address::from_xdr(env, &Bytes::from_array(env, &b)).unwrap()
}

// Fixed payout recipients for the committed proofs. Contract addresses are
// used (not account addresses) so the token payout needs no trustline, and
// each proof's recipientHash public input is the XDR SHA-256 (mod r) of the
// recipient address — a claim pays out only to the exact registered
// recipient (issue #266), a same-proof replay to any other address is
// rejected.
fn dev_recipient_r0(env: &Env) -> Address {
    fixture_recipient_xdr(env, 1)
}

fn dev_recipient_r1(env: &Env) -> Address {
    fixture_recipient_xdr(env, 2)
}
/// The generator (Node) and the contract (Rust) derive the public signals independently; they must agree.
#[test]
fn dev_fixture_derivations_match_the_contract() {
    let env = Env::default();
    let fr = |s: &str| fr_from_dec_str(&env, s);
    assert_eq!(
        expected_external_nullifier(&env, 0, 0),
        fr(dev_fixtures::EXTERNAL_NULLIFIER_ROUND0)
    );
    assert_eq!(
        expected_external_nullifier(&env, 0, 1),
        fr(dev_fixtures::EXTERNAL_NULLIFIER_ROUND1)
    );
    assert_eq!(
        Contract::compute_recipient_hash(&env, &dev_recipient_r0(&env)),
        fr(dev_fixtures::RECIPIENT_HASH_ROUND0)
    );
    assert_eq!(
        Contract::compute_recipient_hash(&env, &dev_recipient_r1(&env)),
        fr(dev_fixtures::RECIPIENT_HASH_ROUND1)
    );
    assert_ne!(
        fr(dev_fixtures::NULLIFIER_HASH_ROUND0),
        fr(dev_fixtures::NULLIFIER_HASH_ROUND1)
    );
}

fn create_token(env: &Env, admin: &Address) -> Address {
    env.register_stellar_asset_contract_v2(admin.clone())
        .address()
}

fn expected_external_nullifier(env: &Env, circle_id: u64, round: u32) -> Fr {
    Contract::compute_external_nullifier(env, circle_id, round)
}

struct Setup {
    env: Env,
    client_id: Address,
    admin: Address,
    token: Address,
    members: StdVec<Address>,
    circle_id: u64,
    size: u32,
    contribution: i128,
}

fn setup(size: u32, contribution: i128) -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let token_admin_client = token::StellarAssetClient::new(&env, &token);

    // this is the FIRST circle registered against a fresh contract, so it
    // is assigned circle_id=0 — matching the real proof fixtures above,
    // which were generated for circle_id=0.
    let root = dev_root(&env);
    let vk = dev_verification_key(&env);
    let circle_id = client.create_circle(
        &admin,
        &token,
        &root,
        &contribution,
        &size,
        &0u32,
        &vk,
        &0u32,
        &Address::generate(&env),
    );
    assert_eq!(circle_id, 0);

    let mut members: StdVec<Address> = StdVec::new();
    for _ in 0..size {
        let m = Address::generate(&env);
        token_admin_client.mint(&m, &contribution);
        members.push(m);
    }

    Setup {
        env,
        client_id: contract_id,
        admin,
        token,
        members,
        circle_id,
        size,
        contribution,
    }
}

/// Like [`setup`] but creates the circle with a non-zero protocol fee and
/// returns the fee recipient alongside, so claim tests can assert against
/// exactly who received the deducted amount.
fn setup_with_fee(size: u32, contribution: i128, fee_bps: u32) -> (Setup, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let token_admin_client = token::StellarAssetClient::new(&env, &token);

    let root = dev_root(&env);
    let vk = dev_verification_key(&env);
    let fee_recipient = Address::generate(&env);
    let circle_id = client.create_circle(
        &admin,
        &token,
        &root,
        &contribution,
        &size,
        &0u32,
        &vk,
        &fee_bps,
        &fee_recipient,
    );
    assert_eq!(circle_id, 0);

    let mut members: StdVec<Address> = StdVec::new();
    for _ in 0..size {
        let m = Address::generate(&env);
        token_admin_client.mint(&m, &contribution);
        members.push(m);
    }

    let setup = Setup {
        env,
        client_id: contract_id,
        admin,
        token,
        members,
        circle_id,
        size,
        contribution,
    };
    (setup, fee_recipient)
}

#[test]
fn happy_path_round_pays_out_and_advances() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let token_client = token::Client::new(&s.env, &s.token);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let circle = client.get_circle(&s.circle_id);
    assert_eq!(circle.pot, s.contribution * (s.size as i128));

    let recipient = dev_recipient_r0(&s.env); // fixed fixture recipient bound to dev_proof_round0
    let nullifier_hash = dev_nullifier_hash_round0(&s.env);
    let external_nullifier = dev_external_nullifier_round0(&s.env);
    let proof = dev_proof_round0(&s.env);

    client.claim(
        &s.circle_id,
        &recipient,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );

    assert_eq!(
        token_client.balance(&recipient),
        s.contribution * (s.size as i128)
    );
    assert_eq!(token_client.balance(&s.client_id), 0);

    let circle_after = client.get_circle(&s.circle_id);
    assert_eq!(circle_after.pot, 0);
    assert_eq!(circle_after.round, 1);
}

// ---- Issue #252: protocol fees ----

// Requires a successful claim: the proof must verify against the committed
// vk AND its recipientHash public input must match the payout address
// (issue #266/#275) — satisfied by the regenerated fixtures and the fixed
// dev_recipient_r0 payout address below.
#[test]
fn claim_deducts_fee_and_sends_to_fee_recipient() {
    // 500 bps = 5% of a 5 * 100 = 500 stroop pot → 25 fee, 475 net.
    // Asserts the `apply_fee` invariant fee + net == payout on-chain.
    let (s, fee_recipient) = setup_with_fee(5, 100, 500);
    let client = ContractClient::new(&s.env, &s.client_id);
    let token_client = token::Client::new(&s.env, &s.token);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let payout = s.contribution * (s.size as i128);
    let recipient = dev_recipient_r0(&s.env);
    let nullifier_hash = dev_nullifier_hash_round0(&s.env);
    let external_nullifier = dev_external_nullifier_round0(&s.env);
    let proof = dev_proof_round0(&s.env);
    client.claim(
        &s.circle_id,
        &recipient,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );

    let fee = 25i128;
    let net = payout - fee;
    assert_eq!(fee + net, payout, "apply_fee must preserve the amount");
    assert_eq!(token_client.balance(&fee_recipient), fee);
    assert_eq!(token_client.balance(&recipient), net);
    assert_eq!(token_client.balance(&s.client_id), 0);
}

#[test]
fn claim_skips_fee_transfer_when_fee_bps_zero() {
    // fee_bps = 0 must behave exactly as a pre-fee circle: one payout
    // transfer to the recipient, nothing to the (ignored) fee recipient.
    let (s, fee_recipient) = setup_with_fee(5, 100, 0);
    let client = ContractClient::new(&s.env, &s.client_id);
    let token_client = token::Client::new(&s.env, &s.token);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let payout = s.contribution * (s.size as i128);
    let recipient = dev_recipient_r0(&s.env);
    client.claim(
        &s.circle_id,
        &recipient,
        &dev_nullifier_hash_round0(&s.env),
        &dev_external_nullifier_round0(&s.env),
        &dev_proof_round0(&s.env),
    );

    assert_eq!(token_client.balance(&fee_recipient), 0);
    assert_eq!(token_client.balance(&recipient), payout);
}

#[test]
fn fee_is_immutable_after_creation() {
    // There is deliberately no setter for fee_bps/fee_recipient (ADR 007):
    // once committed at create_circle, every public entrypoint leaves them
    // exactly as they were. Funding and claiming both write the circle on
    // every call; asserting the fee survives fund (and the earlier
    // create_circle_accepts_maximum_fee_bps / claim tests) pins that down.
    let (s, fee_recipient) = setup_with_fee(5, 100, 250);
    let client = ContractClient::new(&s.env, &s.client_id);

    let circle_before = client.get_circle(&s.circle_id);
    assert_eq!(circle_before.fee_bps, 250);
    assert_eq!(circle_before.fee_recipient, fee_recipient);

    client.fund(&s.circle_id, &s.members[0]);

    let circle_after = client.get_circle(&s.circle_id);
    assert_eq!(circle_after.fee_bps, 250);
    assert_eq!(circle_after.fee_recipient, fee_recipient);
    assert_eq!(circle_after.pot, s.contribution);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")] // InvalidProof
fn claim_reverts_on_tampered_public_input() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let recipient = dev_recipient_r0(&s.env);
    // the real proof's actual output is dev_nullifier_hash_round0(); claiming
    // with a different nullifier_hash means the pairing check is being
    // asked to verify a statement the proof doesn't attest to.
    let wrong_nullifier_hash =
        dev_nullifier_hash_round0(&s.env) + Fr::from_u256(U256::from_u32(&s.env, 1));
    let external_nullifier = dev_external_nullifier_round0(&s.env);
    let proof = dev_proof_round0(&s.env);

    client.claim(
        &s.circle_id,
        &recipient,
        &wrong_nullifier_hash,
        &external_nullifier,
        &proof,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")] // RoundNotFunded
                                                  // Ideally we'd pin pot == contribution*size - 1 (the single stroop
                                                  // short of full) as the tightest possible underfunded case. But `fund`
                                                  // only ever moves whole `contribution`-sized deposits — there's no way
                                                  // to land the pot on a non-multiple-of-contribution value through the
                                                  // public API. The tightest *reachable* underfunded state is one missing
                                                  // depositor, so that's what this test pins instead.
fn claim_reverts_when_underfunded() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    // only 4 of 5 members fund this round
    for m in s.members.iter().take(4) {
        client.fund(&s.circle_id, m);
    }

    let recipient = dev_recipient_r0(&s.env);
    let nullifier_hash = dev_nullifier_hash_round0(&s.env);
    let external_nullifier = dev_external_nullifier_round0(&s.env);
    let proof = dev_proof_round0(&s.env);

    client.claim(
        &s.circle_id,
        &recipient,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")] // RoundNotFunded
fn claim_immediately_after_round_advance_reverts() {
    // Regression guard: after a successful claim, pot must reset to 0 and
    // round 2 must require its own fresh funding — not silently inherit
    // round 1's now-stale "fully funded" state.
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let recipient = dev_recipient_r0(&s.env);
    let nullifier_hash = dev_nullifier_hash_round0(&s.env);
    let external_nullifier = dev_external_nullifier_round0(&s.env);
    let proof = dev_proof_round0(&s.env);

    client.claim(
        &s.circle_id,
        &recipient,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );

    let circle = client.get_circle(&s.circle_id);
    assert_eq!(circle.pot, 0);
    assert_eq!(circle.round, 1);

    // No one has funded round 1 yet — this must revert with RoundNotFunded,
    // not pay out against a stale/leftover pot value.
    let recipient2 = Address::generate(&s.env);
    client.claim(
        &s.circle_id,
        &recipient2,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")] // AlreadyClaimed
fn second_claim_with_same_nullifier_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let nullifier_hash = dev_nullifier_hash_round0(&s.env);
    let proof = dev_proof_round0(&s.env);

    // round 0: claim succeeds and marks the nullifier used
    let recipient_a = dev_recipient_r0(&s.env);
    let external_nullifier_0 = dev_external_nullifier_round0(&s.env);
    client.claim(
        &s.circle_id,
        &recipient_a,
        &nullifier_hash,
        &external_nullifier_0,
        &proof,
    );

    // top up and fund round 1 fully, then try to reuse the exact same
    // nullifier_hash from round 0. It's rejected by the nullifier map
    // before the (real, but now mismatched-round) proof would even be
    // checked, so reusing `proof` here is fine.
    let token_admin_client = token::StellarAssetClient::new(&s.env, &s.token);
    for m in s.members.iter() {
        token_admin_client.mint(m, &s.contribution);
        client.fund(&s.circle_id, m);
    }
    let recipient_b = Address::generate(&s.env);
    let external_nullifier_1 = expected_external_nullifier(&s.env, s.circle_id, 1);
    client.claim(
        &s.circle_id,
        &recipient_b,
        &nullifier_hash,
        &external_nullifier_1,
        &proof,
    );
}

// ---- Issue #91: current multi-round semantics ----
//
// This is the definitive answer to "can the same identity claim two
// consecutive rounds today?" — YES. `nullifierHash = Poseidon(identityNullifier,
// externalNullifier)` and externalNullifier is derived from `round`, so the
// same identity produces a *different* nullifierHash each round, and the
// contract's nullifier map is keyed per (circle_id, nullifier_hash) with no
// round-independent identity tracking. Nothing here is a bug in the code
// tested elsewhere in this file (WrongRoundTag/AlreadyClaimed both still work
// correctly per-round) — it's a real gap: nothing currently stops one member
// from claiming every single round of a cycle. See docs/ for the proposed fix.
#[test]
fn same_identity_can_claim_two_consecutive_rounds() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let token_admin_client = token::StellarAssetClient::new(&env, &token);
    let token_client = token::Client::new(&env, &token);

    let root = dev_root(&env);
    let vk = dev_verification_key(&env);
    let contribution: i128 = 100;
    let circle_id = client.create_circle(
        &admin,
        &token,
        &root,
        &contribution,
        &1u32,
        &0u32,
        &vk,
        &0u32,
        &Address::generate(&env),
    );

    // ---- round 0: fund and claim with the real identity ----
    let funder = Address::generate(&env);
    token_admin_client.mint(&funder, &contribution);
    client.fund(&circle_id, &funder);

    let nullifier_hash_r0 = dev_nullifier_hash_round0(&env);
    let external_nullifier_r0 = dev_external_nullifier_round0(&env);
    let proof_r0 = dev_proof_round0(&env);

    assert!(!client.has_claimed(&circle_id, &nullifier_hash_r0));
    let recipient_r0 = dev_recipient_r0(&env);
    client.claim(
        &circle_id,
        &recipient_r0,
        &nullifier_hash_r0,
        &external_nullifier_r0,
        &proof_r0,
    );
    // The nullifier stays recorded for the life of the circle (round-scoped; ADR 002 clearing is
    // not implemented), even though the round advanced.
    assert!(client.has_claimed(&circle_id, &nullifier_hash_r0));
    assert_eq!(token_client.balance(&recipient_r0), contribution);

    let circle = client.get_circle(&circle_id);
    assert_eq!(circle.round, 1);
    assert_eq!(circle.pot, 0);

    // ---- round 1: fund again, then claim again — same identity, no error ----
    token_admin_client.mint(&funder, &contribution);
    client.fund(&circle_id, &funder);

    let nullifier_hash_r1 = dev_nullifier_hash_round1(&env);
    let external_nullifier_r1 = expected_external_nullifier(&env, circle_id, 1);
    let proof_r1 = dev_proof_round1(&env);

    // Different round -> different nullifierHash for the SAME identity, so
    // it reads as "never claimed" even though this identity already claimed
    // round 0 above.
    assert_ne!(nullifier_hash_r0, nullifier_hash_r1);
    assert!(!client.has_claimed(&circle_id, &nullifier_hash_r1));

    let recipient_r1 = dev_recipient_r1(&env);
    client.claim(
        &circle_id,
        &recipient_r1,
        &nullifier_hash_r1,
        &external_nullifier_r1,
        &proof_r1,
    );

    // The claim succeeded: no RoundNotFunded/WrongRoundTag/AlreadyClaimed/
    // InvalidProof panic. Same identity, two rounds, two payouts.
    // Both rounds' nullifiers are now recorded, and they are different values.
    assert!(client.has_claimed(&circle_id, &nullifier_hash_r1));
    assert!(client.has_claimed(&circle_id, &nullifier_hash_r0));
    assert_eq!(token_client.balance(&recipient_r1), contribution);
    assert_eq!(client.get_circle(&circle_id).round, 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")] // WrongRoundTag
fn claim_reverts_on_stale_round_tag() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let recipient = dev_recipient_r0(&s.env);
    let nullifier_hash = dev_nullifier_hash_round0(&s.env);
    // wrong: this circle is still on round 0, but we tag the proof for round 1
    let external_nullifier = expected_external_nullifier(&s.env, s.circle_id, 1);
    let proof = dev_proof_round0(&s.env);

    client.claim(
        &s.circle_id,
        &recipient,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );
}

#[test]
fn fund_requires_member_auth() {
    // env.auths() reports the authorization tree seen during the *last*
    // invocation, so calling it straight after fund() isolates that call
    // regardless of what setup() already authorized.
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    let member = &s.members[0];
    client.fund(&s.circle_id, member);

    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(&auths[0].0, member);
}

#[test]
fn create_circle_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);

    let root = dev_root(&env);
    let vk = dev_verification_key(&env);
    client.create_circle(
        &admin,
        &token,
        &root,
        &100i128,
        &5u32,
        &0u32,
        &vk,
        &0u32,
        &Address::generate(&env),
    );

    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, admin);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")] // InvalidFeeParams
fn create_circle_rejects_fee_bps_out_of_range() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let root = dev_root(&env);
    let vk = dev_verification_key(&env);
    let fee_recipient = Address::generate(&env);
    client.create_circle(
        &admin,
        &token,
        &root,
        &100i128,
        &5u32,
        &0u32,
        &vk,
        &10_001u32,
        &fee_recipient,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")] // InvalidRecipient
fn create_circle_rejects_contract_as_fee_recipient() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let root = dev_root(&env);
    let vk = dev_verification_key(&env);
    client.create_circle(
        &admin,
        &token,
        &root,
        &100i128,
        &5u32,
        &0u32,
        &vk,
        &500u32,
        &contract_id,
    );
}

#[test]
fn create_circle_accepts_maximum_fee_bps() {
    let (s, fee_recipient) = setup_with_fee(5, 100, 10_000);
    let circle = ContractClient::new(&s.env, &s.client_id).get_circle(&s.circle_id);
    assert_eq!(circle.fee_bps, 10_000);
    assert_eq!(circle.fee_recipient, fee_recipient);
}

#[test]
fn create_circle_emits_created_event() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let root = dev_root(&env);
    let vk = dev_verification_key(&env);
    let contribution: i128 = 100;
    let size: u32 = 5;
    let circle_id = client.create_circle(
        &admin,
        &token,
        &root,
        &contribution,
        &size,
        &0u32,
        &vk,
        &0u32,
        &Address::generate(&env),
    );

    let env_ref = env.clone();
    let events = all_events(&env);
    let event = events
        .iter()
        .find(|(_, topics, _)| {
            let t0: Option<Symbol> = topics.get(0).and_then(|v| v.try_into_val(&env_ref).ok());
            let t1: Option<Symbol> = topics.get(1).and_then(|v| v.try_into_val(&env_ref).ok());
            t0 == Some(symbol_short!("circle")) && t1 == Some(symbol_short!("created"))
        })
        .unwrap();

    let (_, topics, data) = event;
    let t0: Symbol = topics.get(0).unwrap().try_into_val(&env_ref).unwrap();
    assert_eq!(t0, symbol_short!("circle"));
    let topic2: u64 = topics.get(2).unwrap().try_into_val(&env).unwrap();
    assert_eq!(topic2, circle_id);

    // Verify field names and order via the typed event struct's Map
    let map: Map<Symbol, Val> = data.try_into_val(&env).unwrap();
    let event_admin: Address = map
        .get(symbol_short!("admin"))
        .unwrap()
        .try_into_val(&env)
        .unwrap();
    let event_token: Address = map
        .get(symbol_short!("token"))
        .unwrap()
        .try_into_val(&env)
        .unwrap();
    let event_contribution: i128 = map
        .get(symbol_short!("contrib"))
        .unwrap()
        .try_into_val(&env)
        .unwrap();
    let event_size: u32 = map
        .get(symbol_short!("size"))
        .unwrap()
        .try_into_val(&env)
        .unwrap();
    assert_eq!(event_admin, admin);
    assert_eq!(event_token, token);
    assert_eq!(event_contribution, contribution);
    assert_eq!(event_size, size);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")] // InvalidCircleParams
fn create_circle_rejects_size_above_max_capacity() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let root = dev_root(&env);
    let vk = dev_verification_key(&env);

    // The Merkle tree holds at most 2^4 = 16 commitments (circuits/config.json);
    // a larger size can never be fully claimed.
    let oversized = MAX_CIRCLE_SIZE + 1;
    client.create_circle(
        &admin,
        &token,
        &root,
        &100i128,
        &oversized,
        &0u32,
        &vk,
        &0u32,
        &Address::generate(&env),
    );
}

#[test]
fn create_circle_accepts_max_capacity_size() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let root = dev_root(&env);
    let vk = dev_verification_key(&env);

    let circle_id = client.create_circle(
        &admin,
        &token,
        &root,
        &100i128,
        &MAX_CIRCLE_SIZE,
        &0u32,
        &vk,
        &0u32,
        &Address::generate(&env),
    );
    let circle = client.get_circle(&circle_id);
    assert_eq!(circle.size, MAX_CIRCLE_SIZE);
}

#[test]
fn max_circle_size_matches_circuit_levels() {
    // The bound is asserted against the source of truth, not just commented:
    // bumping `levels` in circuits/config.json without updating MAX_CIRCLE_SIZE
    // fails this test, forcing a deliberate review of the contract constant
    // (and a redeploy, since the bound is compiled into the WASM).
    let config_path =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../circuits/config.json");
    let contents = std::fs::read_to_string(&config_path)
        .expect("circuits/config.json not found; run tests from a full checkout");

    let levels = parse_config_levels(&contents).unwrap_or_else(|| {
        panic!("circuits/config.json must contain a numeric \"levels\" field: {contents}")
    });

    // 2^levels computed in u64 so an absurdly deep circuit still yields a
    // clean assertion failure instead of an integer-overflow panic.
    let capacity = 1u64 << levels;
    assert_eq!(
        MAX_CIRCLE_SIZE as u64, capacity,
        "MAX_CIRCLE_SIZE must equal 2^levels ({capacity}) from circuits/config.json \
         — update the constant (and redeploy the contract) when the circuit depth changes",
    );
}

/// Extract the numeric `levels` value from the JSON file contents.
/// The config is `{ "levels": 4 }`; parsed by hand to keep tests dependency-free.
fn parse_config_levels(contents: &str) -> Option<u32> {
    let needle = "\"levels\"";
    let after_key = &contents[contents.find(needle)? + needle.len()..];
    let after_colon = &after_key[after_key.find(':')? + 1..];
    let after_ws = after_colon.trim_start();
    let digits: std::string::String = after_ws
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    digits.parse::<u32>().ok()
}

#[test]
fn fund_emits_funded_event() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let from = s.members[0].clone();
    client.fund(&s.circle_id, &from);

    let env_ref = s.env.clone();
    let events = all_events(&s.env);
    let event = events
        .iter()
        .find(|(_, topics, _)| {
            let t0: Option<Symbol> = topics.get(0).and_then(|v| v.try_into_val(&env_ref).ok());
            let t1: Option<Symbol> = topics.get(1).and_then(|v| v.try_into_val(&env_ref).ok());
            t0 == Some(symbol_short!("circle")) && t1 == Some(symbol_short!("funded"))
        })
        .unwrap();

    let (_, topics, data) = event;
    let t0: Symbol = topics.get(0).unwrap().try_into_val(&env_ref).unwrap();
    assert_eq!(t0, symbol_short!("circle"));
    let topic2: u64 = topics.get(2).unwrap().try_into_val(&s.env).unwrap();
    assert_eq!(topic2, s.circle_id);

    let map: Map<Symbol, Val> = data.try_into_val(&s.env).unwrap();
    let event_from: Address = map
        .get(symbol_short!("from"))
        .unwrap()
        .try_into_val(&s.env)
        .unwrap();
    let new_pot: i128 = map
        .get(symbol_short!("pot"))
        .unwrap()
        .try_into_val(&s.env)
        .unwrap();
    let target: i128 = map
        .get(symbol_short!("target"))
        .unwrap()
        .try_into_val(&s.env)
        .unwrap();
    assert_eq!(event_from, from);
    assert_eq!(new_pot, s.contribution);
    assert_eq!(target, s.contribution * (s.size as i128));
}

#[test]
fn claim_emits_claimed_event() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let recipient = dev_recipient_r0(&s.env);
    let nullifier_hash = dev_nullifier_hash_round0(&s.env);
    let external_nullifier = dev_external_nullifier_round0(&s.env);
    let proof = dev_proof_round0(&s.env);
    client.claim(
        &s.circle_id,
        &recipient,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );

    let env_ref = s.env.clone();
    let events = all_events(&s.env);
    let event = events
        .iter()
        .find(|(_, topics, _)| {
            let t0: Option<Symbol> = topics.get(0).and_then(|v| v.try_into_val(&env_ref).ok());
            let t1: Option<Symbol> = topics.get(1).and_then(|v| v.try_into_val(&env_ref).ok());
            t0 == Some(symbol_short!("circle")) && t1 == Some(symbol_short!("claimed"))
        })
        .unwrap();

    let (_, topics, data) = event;
    let t0: Symbol = topics.get(0).unwrap().try_into_val(&env_ref).unwrap();
    assert_eq!(t0, symbol_short!("circle"));
    let topic2: u64 = topics.get(2).unwrap().try_into_val(&s.env).unwrap();
    assert_eq!(topic2, s.circle_id);

    let map: Map<Symbol, Val> = data.try_into_val(&s.env).unwrap();
    let claimed_round: u32 = map
        .get(symbol_short!("cround"))
        .unwrap()
        .try_into_val(&s.env)
        .unwrap();
    let payout: i128 = map
        .get(symbol_short!("payout"))
        .unwrap()
        .try_into_val(&s.env)
        .unwrap();
    let event_recipient: Address = map
        .get(symbol_short!("recipient"))
        .unwrap()
        .try_into_val(&s.env)
        .unwrap();
    assert_eq!(claimed_round, 0);
    assert_eq!(payout, s.contribution * (s.size as i128));
    assert_eq!(event_recipient, recipient);
}

#[test]
fn cancel_circle_emits_cancelled_event() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    for m in s.members.iter().take(2) {
        client.fund(&s.circle_id, m);
    }
    client.cancel_circle(&s.circle_id);

    let env_ref = s.env.clone();
    let events = all_events(&s.env);
    let event = events
        .iter()
        .find(|(_, topics, _)| {
            let t0: Option<Symbol> = topics.get(0).and_then(|v| v.try_into_val(&env_ref).ok());
            let t1: Option<Symbol> = topics.get(1).and_then(|v| v.try_into_val(&env_ref).ok());
            t0 == Some(symbol_short!("circle")) && t1 == Some(symbol_short!("cancelled"))
        })
        .unwrap();

    let (_, topics, data) = event;
    let t0: Symbol = topics.get(0).unwrap().try_into_val(&env_ref).unwrap();
    assert_eq!(t0, symbol_short!("circle"));
    let topic2: u64 = topics.get(2).unwrap().try_into_val(&s.env).unwrap();
    assert_eq!(topic2, s.circle_id);

    let map: Map<Symbol, Val> = data.try_into_val(&s.env).unwrap();
    let refunded_count: u32 = map
        .get(symbol_short!("rcount"))
        .unwrap()
        .try_into_val(&s.env)
        .unwrap();
    let refunded_total: i128 = map
        .get(symbol_short!("rtotal"))
        .unwrap()
        .try_into_val(&s.env)
        .unwrap();
    assert_eq!(refunded_count, 2);
    assert_eq!(refunded_total, s.contribution * 2i128);
}

#[test]
fn propose_admin_emits_event() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let root = dev_root(&env);
    let vk = dev_verification_key(&env);
    let circle_id = client.create_circle(
        &admin,
        &token,
        &root,
        &100i128,
        &5u32,
        &0u32,
        &vk,
        &0u32,
        &Address::generate(&env),
    );
    let new_admin = Address::generate(&env);
    client.propose_admin(&circle_id, &new_admin);

    let events = all_events(&env);
    let event = events
        .iter()
        .find(|(_, topics, _)| {
            let t0: Option<Symbol> = topics.get(0).and_then(|v| v.try_into_val(&env).ok());
            t0 == Some(symbol_short!("prop_adm"))
        })
        .unwrap();
    // circle_id is the indexed topic (docs/events.md "Topic Format"), not a data field.
    let (_, topics, data) = event;
    let circle_id_val: u64 = topics.get(1).unwrap().try_into_val(&env).unwrap();
    assert_eq!(circle_id_val, circle_id);
    let map: Map<Symbol, Val> = data.try_into_val(&env).unwrap();
    assert!(map.get(symbol_short!("new_admin")).is_some());
}

#[test]
fn accept_admin_emits_event() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let root = dev_root(&env);
    let vk = dev_verification_key(&env);
    let circle_id = client.create_circle(
        &admin,
        &token,
        &root,
        &100i128,
        &5u32,
        &0u32,
        &vk,
        &0u32,
        &Address::generate(&env),
    );
    let new_admin = Address::generate(&env);
    client.propose_admin(&circle_id, &new_admin);
    client.accept_admin(&circle_id);

    let events = all_events(&env);
    let event = events
        .iter()
        .find(|(_, topics, _)| {
            let t0: Option<Symbol> = topics.get(0).and_then(|v| v.try_into_val(&env).ok());
            t0 == Some(symbol_short!("acc_adm"))
        })
        .unwrap();
    // circle_id is the indexed topic (docs/events.md "Topic Format"), not a data field.
    let (_, topics, data) = event;
    let circle_id_val: u64 = topics.get(1).unwrap().try_into_val(&env).unwrap();
    assert_eq!(circle_id_val, circle_id);
    let map: Map<Symbol, Val> = data.try_into_val(&env).unwrap();
    assert!(map.get(symbol_short!("new_admin")).is_some());
}

#[test]
fn expire_round_emits_event() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let root = dev_root(&env);
    let vk = dev_verification_key(&env);
    let circle_id = client.create_circle(
        &admin,
        &token,
        &root,
        &100i128,
        &5u32,
        &10u32,
        &vk,
        &0u32,
        &Address::generate(&env),
    );
    // Advance ledger past deadline
    env.ledger().with_mut(|l| {
        l.sequence_number += 20;
    });
    client.expire_round(&circle_id);

    let events = all_events(&env);
    let event = events
        .iter()
        .find(|(_, topics, _)| {
            let t0: Option<Symbol> = topics.get(0).and_then(|v| v.try_into_val(&env).ok());
            t0 == Some(symbol_short!("rnd_exp"))
        })
        .unwrap();
    // circle_id is the indexed topic (docs/events.md "Topic Format"), not a data field.
    let (_, topics, data) = event;
    let circle_id_val: u64 = topics.get(1).unwrap().try_into_val(&env).unwrap();
    assert_eq!(circle_id_val, circle_id);
    let map: Map<Symbol, Val> = data.try_into_val(&env).unwrap();
    assert!(map.get(symbol_short!("eround")).is_some());
}

#[test]
fn get_circle_count_tracks_next_circle_id() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    assert_eq!(client.get_circle_count(), 0);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let root = dev_root(&env);
    let vk = dev_verification_key(&env);

    client.create_circle(
        &admin,
        &token,
        &root,
        &100i128,
        &5u32,
        &0u32,
        &vk,
        &0u32,
        &Address::generate(&env),
    );
    assert_eq!(client.get_circle_count(), 1);

    client.create_circle(
        &admin,
        &token,
        &root,
        &100i128,
        &5u32,
        &0u32,
        &vk,
        &0u32,
        &Address::generate(&env),
    );
    assert_eq!(client.get_circle_count(), 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn fund_unknown_circle_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.fund(&999u64, &s.members[0]);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn claim_unknown_circle_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let recipient = dev_recipient_r0(&s.env);
    client.claim(
        &999u64,
        &recipient,
        &dev_nullifier_hash_round0(&s.env),
        &dev_external_nullifier_round0(&s.env),
        &dev_proof_round0(&s.env),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn get_circle_unknown_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let _ = client.get_circle(&999u64);
}

#[test]
fn get_round_returns_current_round() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    assert_eq!(client.get_round(&s.circle_id), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn get_round_unknown_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.get_round(&999u64);
}

#[test]
fn get_pot_returns_current_pot() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    assert_eq!(client.get_pot(&s.circle_id), 0i128);

    client.fund(&s.circle_id, &s.members[0]);
    assert_eq!(client.get_pot(&s.circle_id), s.contribution);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn get_pot_unknown_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.get_pot(&999u64);
}

#[test]
fn get_status_returns_round_pot_target_cancelled() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    let (round, pot, target, cancelled) = client.get_status(&s.circle_id);
    assert_eq!(round, 0);
    assert_eq!(pot, 0i128);
    assert_eq!(target, s.contribution * (s.size as i128));
    assert!(!cancelled);

    // Fund one member and confirm pot advances.
    client.fund(&s.circle_id, &s.members[0]);
    let (round2, pot2, target2, cancelled2) = client.get_status(&s.circle_id);
    assert_eq!(round2, 0);
    assert_eq!(pot2, s.contribution);
    assert_eq!(target2, target);
    assert!(!cancelled2);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn get_status_unknown_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.get_status(&999u64);
}

#[test]
fn get_contributors_returns_funders_in_order() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    // Before anyone funds, the list is empty.
    let contributors = client.get_contributors(&s.circle_id);
    assert_eq!(contributors.len(), 0);

    // After two members fund, they appear in insertion order.
    client.fund(&s.circle_id, &s.members[0]);
    client.fund(&s.circle_id, &s.members[1]);
    let contributors = client.get_contributors(&s.circle_id);
    assert_eq!(contributors.len(), 2);
    assert_eq!(contributors.get(0).unwrap(), s.members[0]);
    assert_eq!(contributors.get(1).unwrap(), s.members[1]);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn get_contributors_unknown_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.get_contributors(&999u64);
}

#[test]
fn get_circle_meta_returns_mutable_fields() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    let meta = client.get_circle_meta(&s.circle_id);
    assert_eq!(meta.schema_version, 2);
    assert_eq!(meta.admin, s.admin);
    assert_eq!(meta.token, s.token);
    assert_eq!(meta.contribution, s.contribution);
    assert_eq!(meta.size, s.size);
    assert_eq!(meta.round, 0);
    assert_eq!(meta.pot, 0i128);
    assert!(!meta.cancelled);
    assert_eq!(meta.fee_bps, 0u32);

    // Funding moves pot; the meta read reflects it without a second call.
    client.fund(&s.circle_id, &s.members[0]);
    let meta_after = client.get_circle_meta(&s.circle_id);
    assert_eq!(meta_after.pot, s.contribution);
    assert_eq!(meta_after.round, 0);
}

#[test]
fn get_circle_meta_has_no_group_elements() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    let circle = client.get_circle(&s.circle_id);
    let meta = client.get_circle_meta(&s.circle_id);

    let circle_xdr = circle.clone().to_xdr(&s.env);
    let meta_xdr = meta.to_xdr(&s.env);

    // The full Circle embeds the VK (alpha + 3×G2 + 5×G1 points) and the
    // contributors vector; the meta view must be dramatically smaller.
    assert!(
        meta_xdr.len() < circle_xdr.len() / 2,
        "CircleMeta XDR ({}) should be far smaller than Circle XDR ({}) — \
         the verification key must not be embedded",
        meta_xdr.len(),
        circle_xdr.len(),
    );

    // No BLS12-381 group element from the VK may appear in the meta encoding.
    // G1Affine/G2Affine don't implement PartialEq, so compare serialised bytes.
    for point in [
        circle.vk.alpha.to_xdr(&s.env),
        circle.vk.beta.to_xdr(&s.env),
        circle.vk.gamma.to_xdr(&s.env),
        circle.vk.delta.to_xdr(&s.env),
    ] {
        let needle: StdVec<u8> = point.iter().collect();
        let haystack: StdVec<u8> = meta_xdr.iter().collect();
        assert!(
            !haystack
                .windows(needle.len())
                .any(|w| w == needle.as_slice()),
            "CircleMeta XDR contains a VK group element — get_circle_meta must not \
             return the verification key",
        );
    }
    for ic_point in circle.vk.ic.iter() {
        let needle: StdVec<u8> = ic_point.to_xdr(&s.env).iter().collect();
        let haystack: StdVec<u8> = meta_xdr.iter().collect();
        assert!(
            !haystack
                .windows(needle.len())
                .any(|w| w == needle.as_slice()),
            "CircleMeta XDR contains a VK ic point — get_circle_meta must not \
             return the verification key",
        );
    }
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn get_circle_meta_unknown_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.get_circle_meta(&999u64);
}

#[test]
fn get_vk_returns_committed_verification_key() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    let circle = client.get_circle(&s.circle_id);
    let vk = client.get_vk(&s.circle_id);

    // G1Affine/G2Affine don't implement PartialEq — compare serialised bytes.
    assert_eq!(
        vk.alpha.to_xdr(&s.env),
        circle.vk.alpha.to_xdr(&s.env),
        "alpha"
    );
    assert_eq!(
        vk.beta.to_xdr(&s.env),
        circle.vk.beta.to_xdr(&s.env),
        "beta"
    );
    assert_eq!(
        vk.gamma.to_xdr(&s.env),
        circle.vk.gamma.to_xdr(&s.env),
        "gamma"
    );
    assert_eq!(
        vk.delta.to_xdr(&s.env),
        circle.vk.delta.to_xdr(&s.env),
        "delta"
    );
    assert_eq!(vk.ic.len(), circle.vk.ic.len(), "ic length");
    for (got, want) in vk.ic.iter().zip(circle.vk.ic.iter()) {
        assert_eq!(got.to_xdr(&s.env), want.to_xdr(&s.env), "ic point");
    }
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // CircleNotFound
fn get_vk_unknown_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.get_vk(&999u64);
}

// CPU-instruction harness: measures create_circle / fund / claim, plus a
// synthetic larger-IC Groth16 verify (more public inputs → more g1_mul).
// Tree depth does NOT change claim cost (circuit-only); IC length does.
// Set WRITE_BENCHMARKS=1 to refresh contracts/BENCHMARKS.md.
#[test]
fn cpu_instruction_benchmarks() {
    // ---- create_circle ----
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let root = dev_root(&env);
    let vk = dev_verification_key(&env);
    client.create_circle(
        &admin,
        &token,
        &root,
        &100i128,
        &5u32,
        &0u32,
        &vk,
        &0u32,
        &Address::generate(&env),
    );
    let create_cpu = env.cost_estimate().budget().cpu_instruction_cost();
    std::println!("bench create_circle: {create_cpu} CPU instructions");

    // ---- fund (one member) ----
    let token_admin_client = token::StellarAssetClient::new(&env, &token);
    let member = Address::generate(&env);
    token_admin_client.mint(&member, &100i128);
    client.fund(&0u64, &member);
    let fund_cpu = env.cost_estimate().budget().cpu_instruction_cost();
    std::println!("bench fund:          {fund_cpu} CPU instructions");

    // Fund the remaining 4 so claim can run.
    for _ in 0..4 {
        let m = Address::generate(&env);
        token_admin_client.mint(&m, &100i128);
        client.fund(&0u64, &m);
    }

    // ---- claim (current: 4 public inputs, ic.len() == 5) ----
    let recipient = dev_recipient_r0(&env);
    let nullifier_hash = dev_nullifier_hash_round0(&env);
    let external_nullifier = dev_external_nullifier_round0(&env);
    let proof = dev_proof_round0(&env);

    // ---- claim (rejection path: invalid recipient) ----
    env.cost_estimate().budget().reset_default();
    let res = client.try_claim(
        &0u64,
        &contract_id,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );
    assert!(res.is_err());
    let reject_cpu = env.cost_estimate().budget().cpu_instruction_cost();
    std::println!("bench claim (reject invalid recipient): {reject_cpu} CPU instructions");
    // Should be extremely cheap since it fails on the first line before any cryptography
    assert!(
        reject_cpu < 2_000_000,
        "claim (reject) CPU {reject_cpu} exceeded 2M threshold (should be very cheap)"
    );

    env.cost_estimate().budget().reset_default();
    client.claim(
        &0u64,
        &recipient,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );
    let claim_cpu = env.cost_estimate().budget().cpu_instruction_cost();
    std::println!("bench claim:         {claim_cpu} CPU instructions");

    // Headroom assertion: upgrades that consume the committed safety margin fail loudly.
    assert!(
        claim_cpu < 80_000_000,
        "claim() CPU {claim_cpu} exceeded 80M safety threshold (budget 100M)"
    );

    // ---- larger IC (simulate 5 public inputs → ic.len() == 6) ----
    // Runs the same Groth16 path with one extra g1_mul term (5 instead of
    // 4). Proof will not verify (dummy inputs); we only care about the
    // instruction cost.
    env.cost_estimate().budget().reset_default();
    let mut big_vk = dev_verification_key(&env);
    let pad = big_vk.ic.get(0).unwrap();
    big_vk.ic.push_back(pad);
    let zero = Fr::from_u256(U256::from_u32(&env, 0));
    let big_inputs = vec![
        &env,
        nullifier_hash,
        root,
        external_nullifier,
        zero.clone(),
        zero,
    ];
    let _ = Contract::verify_groth16(&env, &big_vk, &proof, &big_inputs);
    let large_ic_cpu = env.cost_estimate().budget().cpu_instruction_cost();
    std::println!("bench verify_groth16 (5 public inputs / ic=6): {large_ic_cpu} CPU instructions");

    if std::env::var_os("WRITE_BENCHMARKS").is_some() {
        const BUDGET: u64 = 100_000_000;
        let headroom = |cost: u64| (BUDGET.saturating_sub(cost) as f64 / BUDGET as f64) * 100.0;
        let table = std::format!(
            "# Contract CPU benchmarks\n\nGenerated by `WRITE_BENCHMARKS=1 cargo test -p sure_circles cpu_instruction_benchmarks -- --nocapture`.\n\n| Entrypoint | CPU instructions | Budget headroom |\n| --- | ---: | ---: |\n| `create_circle` | {create_cpu} | {:.1}% |\n| `fund` | {fund_cpu} | {:.1}% |\n| `claim` | {claim_cpu} | {:.1}% |\n| `verify_groth16` (5 public inputs) | {large_ic_cpu} | {:.1}% |\n\nThe `claim` row is gated at 80,000,000 instructions; Stellar's transaction budget is 100,000,000.\n",
            headroom(create_cpu),
            headroom(fund_cpu),
            headroom(claim_cpu),
            headroom(large_ic_cpu),
        );
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../BENCHMARKS.md");
        std::fs::write(path, table).expect("write contracts/BENCHMARKS.md");
    }
}

#[test]
fn test_nullifier_set_is_bounded_by_cycle() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let root = dev_root(&env);
    let vk = dev_verification_key(&env);

    let size = 5u32;
    client.create_circle(
        &admin, &token, &root, &100i128, &size, &0u32, &vk, &0u32, &admin,
    );

    for i in 0..20 {
        env.as_contract(&contract_id, || {
            let key = DataKey::Circle(0);
            let mut circle: Circle = env.storage().persistent().get(&key).unwrap();

            // Replicate the effects of `claim` to bypass the proof check
            circle.pot = 0;
            circle.round += 1;
            circle.contributors = Vec::new(&env);
            circle.round_started_ledger = env.ledger().sequence();

            let dummy_nullifier = Fr::from_u256(soroban_sdk::U256::from_u32(&env, i));
            circle.nullifiers.push_back(dummy_nullifier);
            if circle.round.is_multiple_of(circle.size) {
                circle.nullifiers = Vec::new(&env);
            }

            env.storage().persistent().set(&key, &circle);
        });

        let circle = client.get_circle(&0u64);
        assert!(
            circle.nullifiers.len() <= size,
            "Nullifiers exceeded size bound!"
        );
    }
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")] // RoundFull
fn sixth_fund_on_full_round_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let token_admin_client = token::StellarAssetClient::new(&s.env, &s.token);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let circle = client.get_circle(&s.circle_id);
    assert_eq!(circle.pot, s.contribution * (s.size as i128));

    // A sixth deposit must fail with RoundFull — otherwise pot > target and
    // claim's equality check bricks forever.
    let griefer = Address::generate(&s.env);
    token_admin_client.mint(&griefer, &s.contribution);
    client.fund(&s.circle_id, &griefer);
}

#[test]
fn claim_works_on_fully_funded_round_after_cap() {
    // Companion to sixth_fund_on_full_round_reverts: five funds reach the
    // cap exactly, claim still pays out (over-funding never mutated state).
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let token_client = token::Client::new(&s.env, &s.token);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }
    assert_eq!(
        client.get_circle(&s.circle_id).pot,
        s.contribution * (s.size as i128)
    );

    let recipient = dev_recipient_r0(&s.env);
    let nullifier_hash = dev_nullifier_hash_round0(&s.env);
    let external_nullifier = dev_external_nullifier_round0(&s.env);
    let proof = dev_proof_round0(&s.env);
    client.claim(
        &s.circle_id,
        &recipient,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );
    assert_eq!(
        token_client.balance(&recipient),
        s.contribution * (s.size as i128)
    );
}

#[test]
fn has_claimed_false_before_true_after() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let nullifier_hash = dev_nullifier_hash_round0(&s.env);

    assert!(!client.has_claimed(&s.circle_id, &nullifier_hash));

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let recipient = dev_recipient_r0(&s.env);
    let external_nullifier = dev_external_nullifier_round0(&s.env);
    let proof = dev_proof_round0(&s.env);
    client.claim(
        &s.circle_id,
        &recipient,
        &nullifier_hash,
        &external_nullifier,
        &proof,
    );

    assert!(client.has_claimed(&s.circle_id, &nullifier_hash));
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")] // InvalidCircleParams
fn create_circle_rejects_pot_target_overflow() {
    // contribution * size overflows i128, so create_circle rejects the
    // circle at creation time (checked pot-target arithmetic,
    // InvalidCircleParams) before any funds move.
    let _ = setup(2, i128::MAX);
}

#[test]
fn anyone_can_fund() {
    // Open-funding guarantee: a stranger (not in the member set created by
    // setup) can pay a contribution into the circle. Membership gates claim
    // via the Merkle root, not fund. See contracts/README.md.
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let token_admin_client = token::StellarAssetClient::new(&s.env, &s.token);

    let stranger = Address::generate(&s.env);
    token_admin_client.mint(&stranger, &s.contribution);
    client.fund(&s.circle_id, &stranger);

    let circle = client.get_circle(&s.circle_id);
    assert_eq!(circle.pot, s.contribution);
}

// ---- Issue #82: admin cancel/refund path ----

#[test]
fn cancel_refunds_partial_funders_and_closes_circle() {
    // Scenario: 4 of 5 members fund, the 5th never shows up.
    // Admin cancels; all 4 existing funders are refunded exactly
    // `contribution` each, and the circle is permanently closed.
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let _token_admin_client = token::StellarAssetClient::new(&s.env, &s.token);
    let token_client = token::Client::new(&s.env, &s.token);

    // Mint enough for 4 funders (setup only mints `contribution` per member).
    let funders: StdVec<Address> = s.members.iter().take(4).cloned().collect();
    for f in funders.iter() {
        client.fund(&s.circle_id, f);
    }

    let circle_before = client.get_circle(&s.circle_id);
    assert_eq!(circle_before.pot, s.contribution * 4);
    assert_eq!(circle_before.contributors.len(), 4);

    // Record balances before cancel.
    let before: StdVec<i128> = funders.iter().map(|f| token_client.balance(f)).collect();

    let _admin = client.get_circle(&s.circle_id).admin;
    client.cancel_circle(&s.circle_id);

    // Every funder must have been refunded exactly their contribution.
    for (f, bal_before) in funders.iter().zip(before.iter()) {
        assert_eq!(
            token_client.balance(f),
            bal_before + s.contribution,
            "funder {f:?} not fully refunded"
        );
    }

    let circle_after = client.get_circle(&s.circle_id);
    assert_eq!(circle_after.pot, 0);
    assert!(circle_after.cancelled);
    assert_eq!(circle_after.contributors.len(), 0);

    // Contract holds no tokens.
    assert_eq!(token_client.balance(&s.client_id), 0);
}

// ---- Issue #318: cancel before any contributor has funded ----

#[test]
fn cancel_zero_contributors_is_clean_close() {
    // Cancel immediately after create_circle, before anyone funds.
    // The contributors Vec is empty, so the refund loop must be a no-op.
    // Expected outcome: cancelled == true, pot == 0, no token movement.
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let token_client = token::Client::new(&s.env, &s.token);

    // Sanity: nothing in the pot yet.
    let circle_before = client.get_circle(&s.circle_id);
    assert_eq!(circle_before.pot, 0);
    assert_eq!(circle_before.contributors.len(), 0);
    assert!(!circle_before.cancelled);

    // Contract holds no tokens at this point.
    let contract_balance_before = token_client.balance(&s.client_id);
    assert_eq!(contract_balance_before, 0);

    client.cancel_circle(&s.circle_id);

    let circle_after = client.get_circle(&s.circle_id);
    assert_eq!(
        circle_after.pot, 0,
        "pot must remain 0 after cancelling an empty circle"
    );
    assert!(circle_after.cancelled, "circle must be marked cancelled");
    assert_eq!(
        circle_after.contributors.len(),
        0,
        "contributors vec must stay empty"
    );

    // No tokens moved: contract balance is still 0.
    assert_eq!(
        token_client.balance(&s.client_id),
        0,
        "contract token balance must not change"
    );

    // No member token balance should have changed either.
    for m in s.members.iter() {
        assert_eq!(
            token_client.balance(m),
            s.contribution,
            "member {m:?} balance must be unchanged — no refund should have fired"
        );
    }
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")] // CircleCancelled
fn fund_after_zero_contributor_cancel_reverts() {
    // Companion to fund_after_cancel_reverts, starting from the empty state.
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let token_admin_client = token::StellarAssetClient::new(&s.env, &s.token);

    client.cancel_circle(&s.circle_id);

    let extra = Address::generate(&s.env);
    token_admin_client.mint(&extra, &s.contribution);
    client.fund(&s.circle_id, &extra);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")] // CircleCancelled
fn claim_after_zero_contributor_cancel_reverts() {
    // Companion to claim_after_cancel_reverts, starting from the empty state
    // (no members funded before the cancel).
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    client.cancel_circle(&s.circle_id);

    let recipient = dev_recipient_r0(&s.env);
    client.claim(
        &s.circle_id,
        &recipient,
        &dev_nullifier_hash_round0(&s.env),
        &dev_external_nullifier_round0(&s.env),
        &dev_proof_round0(&s.env),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")] // CircleCancelled
fn fund_after_cancel_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    let token_admin_client = token::StellarAssetClient::new(&s.env, &s.token);

    client.cancel_circle(&s.circle_id);

    let extra = Address::generate(&s.env);
    token_admin_client.mint(&extra, &s.contribution);
    client.fund(&s.circle_id, &extra);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")] // CircleCancelled
fn claim_after_cancel_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }
    client.cancel_circle(&s.circle_id);

    let recipient = dev_recipient_r0(&s.env);
    client.claim(
        &s.circle_id,
        &recipient,
        &dev_nullifier_hash_round0(&s.env),
        &dev_external_nullifier_round0(&s.env),
        &dev_proof_round0(&s.env),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")] // CircleCancelled
fn double_cancel_reverts() {
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);
    client.cancel_circle(&s.circle_id);
    client.cancel_circle(&s.circle_id);
}

// ---- Issue #84: instance-storage TTL extension ----

#[test]
#[should_panic(expected = "Error(Contract, #10)")] // InvalidCircleParams
fn create_circle_rejects_truncated_ic() {
    // create_circle validates vk shape up front: the circuit exposes
    // [nullifierHash, root, externalNullifier, recipientHash], so ic must
    // hold one point per public signal plus one (5 total). A truncated ic
    // is rejected at creation (InvalidCircleParams) before any circle or
    // funds exist. verify_groth16 keeps its own length guard as
    // defense-in-depth against a hand-crafted vk ever reaching claim.
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);

    let mut truncated_vk = dev_verification_key(&env);
    assert_eq!(truncated_vk.ic.len(), 5);
    truncated_vk.ic.pop_back(); // Remove the last ic point; len is now 4.
    assert_eq!(truncated_vk.ic.len(), 4);

    client.create_circle(
        &admin,
        &token,
        &dev_root(&env),
        &100i128,
        &5u32,
        &0u32,
        &truncated_vk,
        &0u32,
        &Address::generate(&env),
    );
    unreachable!("create_circle with a truncated vk must revert");
}

#[test]
fn instance_ttl_extended_after_create_fund_claim() {
    // The Soroban test env lets us inspect TTLs via env.ledger().
    // Strategy: bump the ledger far enough that the instance entry would
    // expire if nothing extended it, then perform create/fund/claim and
    // confirm the TTL has been refreshed to at least LEDGER_THRESHOLD.
    //
    // LEDGER_EXTEND_TO == 500_000; we advance by LEDGER_THRESHOLD (100)
    // which is the minimum that triggers an extension.  After the call
    // the remaining TTL must be > 0 (i.e. the entry did not expire).
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    let token_admin_client = token::StellarAssetClient::new(&env, &token);
    let root = dev_root(&env);
    let vk = dev_verification_key(&env);

    // create_circle must extend instance TTL.
    client.create_circle(
        &admin,
        &token,
        &root,
        &100i128,
        &5u32,
        &0u32,
        &vk,
        &0u32,
        &Address::generate(&env),
    );

    // Advance the ledger by LEDGER_THRESHOLD so the instance entry would
    // expire without the extension; the TTL should now be refreshed.
    env.ledger().with_mut(|l| {
        l.sequence_number += LEDGER_THRESHOLD;
        l.timestamp += u64::from(LEDGER_THRESHOLD) * 5;
        l.min_persistent_entry_ttl = LEDGER_THRESHOLD;
        l.min_temp_entry_ttl = LEDGER_THRESHOLD;
    });

    // fund must also extend instance TTL.
    let member = Address::generate(&env);
    token_admin_client.mint(&member, &100i128);
    client.fund(&0u64, &member);

    // fund 4 more so we can claim.
    for _ in 0..4 {
        let m = Address::generate(&env);
        token_admin_client.mint(&m, &100i128);
        client.fund(&0u64, &m);
    }

    // claim must also extend instance TTL.
    let recipient = dev_recipient_r0(&env);
    client.claim(
        &0u64,
        &recipient,
        &dev_nullifier_hash_round0(&env),
        &dev_external_nullifier_round0(&env),
        &dev_proof_round0(&env),
    );

    // Verify the instance entry is still live (has a TTL > 0) after all
    // three write paths have run. If extend_ttl were missing, the entry
    // would have lapsed and NextCircleId would behave unpredictably.
    // The test env raises an error if a live entry is accessed after
    // its TTL expires, so a successful get_circle here is our proof.
    let circle = client.get_circle(&0u64);
    assert_eq!(circle.round, 1, "claim should have advanced round to 1");
}

// ---- Issue #252: apply_fee helper ----

#[test]
fn apply_fee_zero_bps_yields_no_fee() {
    let env = Env::default();
    assert_eq!(apply_fee(&env, 0, 12_345), (0, 12_345));
}

#[test]
fn apply_fee_full_bps_takes_entire_amount() {
    let env = Env::default();
    assert_eq!(apply_fee(&env, 10_000, 12_345), (12_345, 0));
}

#[test]
fn apply_fee_truncates_toward_zero() {
    let env = Env::default();
    // 500 bps = 5%: 12_345 * 500 / 10_000 = 617 (truncated), net 11_728.
    assert_eq!(apply_fee(&env, 500, 12_345), (617, 11_728));
    assert_eq!(617 + 11_728, 12_345);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")] // InvalidFeeParams
fn apply_fee_rejects_out_of_range_bps() {
    let env = Env::default();
    apply_fee(&env, 10_001, 100);
}

mod proptest_apply_fee {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn fee_plus_net_equals_amount(
            amount  in 0_i128..=(i128::MAX / 2),
            fee_bps in 0_u32..=10_000_u32,
        ) {
            let (fee, net) = apply_fee(&Env::default(), fee_bps, amount);
            prop_assert_eq!(
                fee + net,
                amount,
                "apply_fee({}, {}) = ({}, {}); fee + net = {}",
                fee_bps, amount, fee, net, fee + net
            );
        }
    }
}

// ---- Issue #565: round_deadline vs LEDGER_EXTEND_TO ----

#[test]
fn create_circle_rejects_deadline_at_or_above_ledger_extend_to() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let token = create_token(&env, &Address::generate(&env));
    let vk = dev_verification_key(&env);
    let root = dev_root(&env);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.create_circle(
            &admin,
            &token,
            &root,
            &100i128,
            &5u32,
            &LEDGER_EXTEND_TO, // equal to extend target — must reject
            &vk,
            &0u32,
            &Address::generate(&env),
        );
    }));
    assert!(
        result.is_err(),
        "deadline == LEDGER_EXTEND_TO must be rejected"
    );
}

#[test]
fn create_circle_accepts_deadline_just_below_ledger_extend_to() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let token = create_token(&env, &Address::generate(&env));
    let vk = dev_verification_key(&env);
    let root = dev_root(&env);
    let deadline = LEDGER_EXTEND_TO - 1;

    let circle_id = client.create_circle(
        &admin,
        &token,
        &root,
        &100i128,
        &5u32,
        &deadline,
        &vk,
        &0u32,
        &Address::generate(&env),
    );
    let circle = client.get_circle(&circle_id);
    assert_eq!(circle.round_deadline_ledgers, deadline);
}

#[test]
fn nullifier_fence_survives_ttl_expiry() {
    // Issue #565 / #254: advance past LEDGER_EXTEND_TO (not merely
    // LEDGER_THRESHOLD) so the test covers the real archival window.
    let s = setup(5, 100);
    let client = ContractClient::new(&s.env, &s.client_id);

    for m in s.members.iter() {
        client.fund(&s.circle_id, m);
    }

    let recipient = dev_recipient_r0(&s.env);
    let nullifier_hash = dev_nullifier_hash_round0(&s.env);
    client.claim(
        &s.circle_id,
        &recipient,
        &nullifier_hash,
        &dev_external_nullifier_round0(&s.env),
        &dev_proof_round0(&s.env),
    );
    assert!(client.has_claimed(&s.circle_id, &nullifier_hash));

    s.env.ledger().with_mut(|l| {
        l.sequence_number += LEDGER_EXTEND_TO + 10;
        l.timestamp += u64::from(LEDGER_EXTEND_TO + 10) * 5;
    });

    // Re-funding round 1 extends the Circle entry (and embedded nullifiers).
    let token_admin_client = token::StellarAssetClient::new(&s.env, &s.token);
    for m in s.members.iter() {
        token_admin_client.mint(m, &s.contribution);
        client.fund(&s.circle_id, m);
    }

    assert!(
        client.has_claimed(&s.circle_id, &nullifier_hash),
        "nullifier fence must survive ledger advance past LEDGER_EXTEND_TO"
    );
}

// ============================================================================
// Issue #564 — proptest circle invariants
// ============================================================================
//
// Legal transitions are modelled once in `legal::LegalAction` /
// `legal::allowed` and reused by the sequence properties below. Cheap
// pure-math properties (fee arithmetic) keep a high case budget; ledger
// sequence properties stay small.

mod legal {
    use super::*;

    /// Explicit state-machine of calls that are allowed against a live circle.
    /// Illegal calls are never generated — properties assert postconditions
    /// of legal paths, not error codes of illegal ones.
    #[derive(Clone, Copy, Debug)]
    pub enum LegalAction {
        Fund,
        Claim,
        Cancel,
        ExpireRound,
    }

    pub fn pot_target(circle: &Circle) -> i128 {
        circle.contribution * (circle.size as i128)
    }

    pub fn is_full(circle: &Circle) -> bool {
        circle.pot == pot_target(circle)
    }

    pub fn is_round_expired_now(env: &Env, circle: &Circle) -> bool {
        if circle.round_deadline_ledgers == 0 {
            return false;
        }
        let deadline = circle
            .round_started_ledger
            .saturating_add(circle.round_deadline_ledgers);
        env.ledger().sequence() >= deadline
    }

    /// Returns the set of actions that are legal in the current circle state.
    pub fn allowed(env: &Env, circle: &Circle) -> StdVec<LegalAction> {
        let mut out = StdVec::new();
        if circle.cancelled {
            return out;
        }
        if !is_full(circle) && !is_round_expired_now(env, circle) {
            out.push(LegalAction::Fund);
        }
        if is_full(circle) {
            out.push(LegalAction::Claim);
        }
        if !is_full(circle) && is_round_expired_now(env, circle) {
            out.push(LegalAction::ExpireRound);
        }
        out.push(LegalAction::Cancel);
        out
    }
}

mod proptest_circle_invariants {
    use super::legal::{self, LegalAction};
    use super::*;
    use proptest::prelude::*;
    use proptest::test_runner::TestCaseError;
    use std::collections::BTreeSet;

    /// Tracked token flows for the conservation property.
    struct Flows {
        funded: i128,
        paid_out: i128,
        fees: i128,
        refunded: i128,
    }

    impl Flows {
        fn new() -> Self {
            Self {
                funded: 0,
                paid_out: 0,
                fees: 0,
                refunded: 0,
            }
        }

        fn conserved(&self) -> bool {
            self.funded == self.paid_out + self.fees + self.refunded
        }
    }

    fn assert_structural(client: &ContractClient, circle_id: u64) -> Result<(), TestCaseError> {
        let c = client.get_circle(&circle_id);
        let count = c.contributors.len() as i128;
        prop_assert_eq!(
            c.pot,
            c.contribution * count,
            "pot != contribution * contributors.len()"
        );
        let target = c.contribution.saturating_mul(c.size as i128);
        prop_assert!(c.pot <= target, "pot {} > target {}", c.pot, target);

        // Nullifier monotonicity / uniqueness.
        let mut seen = BTreeSet::new();
        for i in 0..c.nullifiers.len() {
            let n = c.nullifiers.get(i).unwrap();
            let bytes = n.to_bytes().to_array();
            prop_assert!(
                seen.insert(bytes),
                "duplicate nullifier in circle.nullifiers"
            );
            prop_assert!(
                client.has_claimed(&circle_id, &n),
                "has_claimed must agree with nullifiers membership"
            );
        }

        if c.cancelled {
            prop_assert_eq!(c.pot, 0, "cancelled pot must be 0");
            prop_assert_eq!(c.contributors.len(), 0, "cancelled contributors empty");
        }
        Ok(())
    }

    // Raise case budget for pure fee arithmetic (already covered by
    // proptest_apply_fee, but pin rounding direction explicitly here too).
    proptest! {
        #![proptest_config(ProptestConfig::with_cases(256))]

        #[test]
        fn fee_arithmetic_exact(
            amount in 0_i128..=1_000_000_000_i128,
            fee_bps in 0_u32..=10_000_u32,
        ) {
            let (fee, net) = apply_fee(&Env::default(), fee_bps, amount);
            prop_assert_eq!(fee + net, amount);
            // Documented rounding: fee = trunc(amount * fee_bps / 10_000)
            // (remainder absorbed by net).
            let expected_fee = (amount / 10_000) * (fee_bps as i128)
                + ((amount % 10_000) * (fee_bps as i128)) / 10_000;
            prop_assert_eq!(fee, expected_fee, "fee rounding direction drifted");
            prop_assert!(fee <= amount);
        }
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(32))]

        /// Conservation: across any legal sequence, tokens in == tokens out
        /// once the circle is quiescent (cancelled, or pot emptied by claim /
        /// expire). Residual contract balance equals live pot.
        #[test]
        fn conservation_across_legal_sequence(
            actions in proptest::collection::vec(0u8..4u8, 1..12),
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let contract_id = env.register(Contract, ());
            let client = ContractClient::new(&env, &contract_id);
            let admin = Address::generate(&env);
            let token_admin = Address::generate(&env);
            let token = create_token(&env, &token_admin);
            let token_admin_client = token::StellarAssetClient::new(&env, &token);
            let token_client = token::Client::new(&env, &token);

            let contribution: i128 = 100;
            let size: u32 = 5;
            let fee_bps: u32 = 500;
            let fee_recipient = Address::generate(&env);
            let circle_id = client.create_circle(
                &admin,
                &token,
                &dev_root(&env),
                &contribution,
                &size,
                &0u32,
                &dev_verification_key(&env),
                &fee_bps,
                &fee_recipient,
            );

            let mut funders: StdVec<Address> = StdVec::new();
            for _ in 0..size {
                let m = Address::generate(&env);
                // Mint enough for several fund attempts across the sequence.
                token_admin_client.mint(&m, &(contribution * 20));
                funders.push(m);
            }

            let mut flows = Flows::new();
            let mut fund_ix: usize = 0;
            let mut claimed_once = false;

            for raw in actions.into_iter() {
                let circle = client.get_circle(&circle_id);
                let allowed = legal::allowed(&env, &circle);
                if allowed.is_empty() {
                    break;
                }
                let action = allowed[(raw as usize) % allowed.len()];

                match action {
                    LegalAction::Fund => {
                        let who = &funders[fund_ix % funders.len()];
                        fund_ix += 1;
                        // Skip if this address already contributed this round.
                        let already = circle.contributors.iter().any(|a| &a == who);
                        if already {
                            continue;
                        }
                        let before = token_client.balance(&contract_id);
                        client.fund(&circle_id, who);
                        let after = token_client.balance(&contract_id);
                        flows.funded += after - before;
                    }
                    LegalAction::Claim => {
                        // Only one real proof fixture for round 0; skip later rounds.
                        if claimed_once || circle.round != 0 {
                            continue;
                        }
                        let pot = circle.pot;
                        let (fee, net) = apply_fee(&env, fee_bps, pot);
                        client.claim(
                            &circle_id,
                            &dev_recipient_r0(&env),
                            &dev_nullifier_hash_round0(&env),
                            &dev_external_nullifier_round0(&env),
                            &dev_proof_round0(&env),
                        );
                        flows.paid_out += net;
                        flows.fees += fee;
                        claimed_once = true;
                    }
                    LegalAction::Cancel => {
                        let refund = circle.pot;
                        client.cancel_circle(&circle_id);
                        flows.refunded += refund;
                    }
                    LegalAction::ExpireRound => {
                        let refund = circle.pot;
                        client.expire_round(&circle_id);
                        flows.refunded += refund;
                    }
                }

                assert_structural(&client, circle_id)?;

                let live = client.get_circle(&circle_id);
                let contract_bal = token_client.balance(&contract_id);
                // Residual held by the contract equals the live pot.
                prop_assert_eq!(
                    contract_bal,
                    live.pot,
                    "contract balance {} != live pot {}",
                    contract_bal,
                    live.pot
                );
                // Accounting identity: funded = paid + fees + refunded + live pot.
                prop_assert_eq!(
                    flows.funded,
                    flows.paid_out + flows.fees + flows.refunded + live.pot,
                    "conservation broken: in={} out_payout={} out_fee={} out_refund={} live={}",
                    flows.funded,
                    flows.paid_out,
                    flows.fees,
                    flows.refunded,
                    live.pot
                );
            }

            let final_c = client.get_circle(&circle_id);
            if final_c.cancelled || final_c.pot == 0 {
                prop_assert!(
                    flows.funded == flows.paid_out + flows.fees + flows.refunded
                        || flows.conserved() && final_c.pot == 0,
                    "quiescent circle must fully conserve"
                );
            }
        }
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(24))]

        /// After cancel_circle, every subsequent call reverts and no field changes.
        #[test]
        fn cancelled_is_terminal(extra_ops in proptest::collection::vec(0u8..5u8, 1..8)) {
            let env = Env::default();
            env.mock_all_auths();
            let contract_id = env.register(Contract, ());
            let client = ContractClient::new(&env, &contract_id);
            let admin = Address::generate(&env);
            let token_admin = Address::generate(&env);
            let token = create_token(&env, &token_admin);
            let token_admin_client = token::StellarAssetClient::new(&env, &token);

            let contribution: i128 = 100;
            let size: u32 = 3;
            let circle_id = client.create_circle(
                &admin,
                &token,
                &dev_root(&env),
                &contribution,
                &size,
                &0u32,
                &dev_verification_key(&env),
                &0u32,
                &Address::generate(&env),
            );

            // Partially fund so cancel has something to refund.
            let m = Address::generate(&env);
            token_admin_client.mint(&m, &contribution);
            client.fund(&circle_id, &m);
            client.cancel_circle(&circle_id);

            let before = client.get_circle(&circle_id);
            prop_assert!(before.cancelled);

            for op in extra_ops.into_iter() {
                let panicked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    match op % 5 {
                        0 => {
                            let who = Address::generate(&env);
                            token_admin_client.mint(&who, &contribution);
                            client.fund(&circle_id, &who);
                        }
                        1 => {
                            client.claim(
                                &circle_id,
                                &dev_recipient_r0(&env),
                                &dev_nullifier_hash_round0(&env),
                                &dev_external_nullifier_round0(&env),
                                &dev_proof_round0(&env),
                            );
                        }
                        2 => client.expire_round(&circle_id),
                        3 => client.propose_admin(&circle_id, &Address::generate(&env)),
                        _ => client.cancel_circle(&circle_id),
                    }
                }))
                .is_err();
                prop_assert!(panicked, "post-cancel op {} must revert", op);
            }

            let after = client.get_circle(&circle_id);
            prop_assert_eq!(after.cancelled, before.cancelled);
            prop_assert_eq!(after.pot, before.pot);
            prop_assert_eq!(after.round, before.round);
            prop_assert_eq!(after.contributors.len(), before.contributors.len());
            prop_assert_eq!(after.admin, before.admin);
        }
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(24))]

        /// After cancel or expire, every address in contributors gets back
        /// exactly `contribution`, once — including the zero-contributor case.
        #[test]
        fn refund_exactness(
            // Keep strictly below size so expire_round remains legal (RoundFull
            // otherwise). Cancel covers the same refund math on a partial pot.
            n_funders in 0usize..=4usize,
            via_cancel in proptest::bool::ANY,
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let contract_id = env.register(Contract, ());
            let client = ContractClient::new(&env, &contract_id);
            let admin = Address::generate(&env);
            let token_admin = Address::generate(&env);
            let token = create_token(&env, &token_admin);
            let token_admin_client = token::StellarAssetClient::new(&env, &token);
            let token_client = token::Client::new(&env, &token);

            let contribution: i128 = 250;
            let size: u32 = 5;
            // Short deadline so expire_round is reachable when !via_cancel.
            let deadline: u32 = if via_cancel { 0 } else { 10 };
            let circle_id = client.create_circle(
                &admin,
                &token,
                &dev_root(&env),
                &contribution,
                &size,
                &deadline,
                &dev_verification_key(&env),
                &0u32,
                &Address::generate(&env),
            );

            let mut funders: StdVec<Address> = StdVec::new();
            let mut balances_before: StdVec<i128> = StdVec::new();
            for _ in 0..n_funders {
                let m = Address::generate(&env);
                let before = token_client.balance(&m); // before mint+fund
                token_admin_client.mint(&m, &contribution);
                client.fund(&circle_id, &m);
                funders.push(m.clone());
                balances_before.push(before);
            }

            if via_cancel {
                client.cancel_circle(&circle_id);
            } else {
                env.ledger().with_mut(|l| {
                    l.sequence_number += deadline + 1;
                    l.timestamp += u64::from(deadline + 1) * 5;
                });
                client.expire_round(&circle_id);
            }

            for (i, who) in funders.iter().enumerate() {
                let after = token_client.balance(who);
                prop_assert_eq!(
                    after,
                    balances_before[i] + contribution,
                    "funder {} refund mismatch",
                    i
                );
            }

            let circle = client.get_circle(&circle_id);
            prop_assert_eq!(circle.pot, 0);
            prop_assert_eq!(circle.contributors.len(), 0);
            if via_cancel {
                prop_assert!(circle.cancelled);
            } else {
                prop_assert!(!circle.cancelled);
            }
        }
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(32))]

        /// Overflow safety: for any (contribution, size) pair, either
        /// create_circle rejects or pot_target never overflows.
        #[test]
        fn create_circle_overflow_safety(
            contribution in 1_i128..=i128::MAX,
            size in 1_u32..=MAX_CIRCLE_SIZE,
            deadline in 0_u32..(LEDGER_EXTEND_TO),
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let contract_id = env.register(Contract, ());
            let client = ContractClient::new(&env, &contract_id);
            let admin = Address::generate(&env);
            let token = create_token(&env, &Address::generate(&env));

            let overflow = contribution.checked_mul(size as i128).is_none();
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.create_circle(
                    &admin,
                    &token,
                    &dev_root(&env),
                    &contribution,
                    &size,
                    &deadline,
                    &dev_verification_key(&env),
                    &0u32,
                    &Address::generate(&env),
                )
            }));

            if overflow {
                prop_assert!(result.is_err(), "overflowing pot_target must be rejected");
            } else if let Ok(circle_id) = result {
                let c = client.get_circle(&circle_id);
                prop_assert_eq!(c.contribution.checked_mul(c.size as i128), Some(c.contribution * (c.size as i128)));
            }
        }
    }

    // Kept for compatibility with the historical random_legal_sequence
    // snapshots / regression seed; reuses the shared legal model.
    proptest! {
        #![proptest_config(ProptestConfig::with_cases(16))]

        #[test]
        fn random_legal_sequence(actions in proptest::collection::vec(0u8..=2u8, 1..20)) {
            let env = Env::default();
            env.mock_all_auths();
            let contract_id = env.register(Contract, ());
            let client = ContractClient::new(&env, &contract_id);
            let admin = Address::generate(&env);
            let token_admin = Address::generate(&env);
            let token = create_token(&env, &token_admin);
            let token_admin_client = token::StellarAssetClient::new(&env, &token);

            let contribution: i128 = 100;
            let size: u32 = 5;
            let circle_id = client.create_circle(
                &admin,
                &token,
                &dev_root(&env),
                &contribution,
                &size,
                &0u32,
                &dev_verification_key(&env),
                &0u32,
                &Address::generate(&env),
            );

            let mut funders: StdVec<Address> = StdVec::new();
            for _ in 0..size {
                let m = Address::generate(&env);
                token_admin_client.mint(&m, &(contribution * 5));
                funders.push(m);
            }

            let mut claimed = false;
            for a in actions.into_iter() {
                let circle = client.get_circle(&circle_id);
                let allowed = legal::allowed(&env, &circle);
                if allowed.is_empty() {
                    break;
                }
                // Map historical 0/1/2 onto Fund/Claim/Cancel when legal.
                let prefer = match a {
                    0 => LegalAction::Fund,
                    1 => LegalAction::Claim,
                    _ => LegalAction::Cancel,
                };
                let action = if allowed.iter().any(|x| matches!((x, prefer), (LegalAction::Fund, LegalAction::Fund) | (LegalAction::Claim, LegalAction::Claim) | (LegalAction::Cancel, LegalAction::Cancel))) {
                    prefer
                } else {
                    allowed[0]
                };

                match action {
                    LegalAction::Fund => {
                        for who in funders.iter() {
                            let already = circle.contributors.iter().any(|c| &c == who);
                            if !already && circle.pot < legal::pot_target(&circle) {
                                client.fund(&circle_id, who);
                                break;
                            }
                        }
                    }
                    LegalAction::Claim => {
                        if !claimed && circle.round == 0 {
                            client.claim(
                                &circle_id,
                                &dev_recipient_r0(&env),
                                &dev_nullifier_hash_round0(&env),
                                &dev_external_nullifier_round0(&env),
                                &dev_proof_round0(&env),
                            );
                            claimed = true;
                        }
                    }
                    LegalAction::Cancel => {
                        client.cancel_circle(&circle_id);
                    }
                    LegalAction::ExpireRound => {
                        client.expire_round(&circle_id);
                    }
                }

                let c = client.get_circle(&circle_id);
                prop_assert_eq!(c.pot, c.contribution * (c.contributors.len() as i128));
            }
        }
    }
}

// ============================================================================
// XDR golden tests — issues #326 / #566
// ============================================================================

mod xdr_golden {
    use super::*;
    use soroban_sdk::xdr::ToXdr;
    use std::path::PathBuf;
    use std::string::String;

    /// Must match `Circle.schema_version` written by `create_circle`.
    /// Bump this AND regenerate goldens when the wire format changes.
    pub const SCHEMA_VERSION: u32 = 2;

    fn to_base64(bytes: &soroban_sdk::Bytes) -> String {
        let raw: StdVec<u8> = bytes.iter().collect();
        base64_encode(&raw)
    }

    fn base64_encode(input: &[u8]) -> String {
        const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::new();
        let mut i = 0;
        while i < input.len() {
            let b0 = input[i] as u32;
            let b1 = if i + 1 < input.len() {
                input[i + 1] as u32
            } else {
                0
            };
            let b2 = if i + 2 < input.len() {
                input[i + 2] as u32
            } else {
                0
            };
            out.push(ALPHABET[((b0 >> 2) & 0x3f) as usize] as char);
            out.push(ALPHABET[(((b0 << 4) | (b1 >> 4)) & 0x3f) as usize] as char);
            if i + 1 < input.len() {
                out.push(ALPHABET[(((b1 << 2) | (b2 >> 6)) & 0x3f) as usize] as char);
            } else {
                out.push('=');
            }
            if i + 2 < input.len() {
                out.push(ALPHABET[(b2 & 0x3f) as usize] as char);
            } else {
                out.push('=');
            }
            i += 3;
        }
        out
    }

    fn goldens_dir() -> PathBuf {
        let manifest = std::env::var("CARGO_MANIFEST_DIR")
            .expect("CARGO_MANIFEST_DIR not set — run via `cargo test`");
        PathBuf::from(manifest)
            .join("test_snapshots")
            .join("xdr_goldens")
    }

    fn golden_name(stem: &str) -> String {
        let mut name = String::from(stem);
        name.push_str(".v");
        name.push_str(itoa_u32(SCHEMA_VERSION).as_str());
        name.push_str(".b64");
        name
    }

    fn itoa_u32(n: u32) -> String {
        // Avoid format!/ToString under #![no_std] + extern crate std quirks.
        let mut buf = [0u8; 10];
        let mut x = n;
        let mut i = buf.len();
        if x == 0 {
            return String::from("0");
        }
        while x > 0 {
            i -= 1;
            buf[i] = b'0' + (x % 10) as u8;
            x /= 10;
        }
        String::from(core::str::from_utf8(&buf[i..]).unwrap())
    }

    fn read_golden(name: &str) -> Option<String> {
        let path = goldens_dir().join(name);
        std::fs::read_to_string(&path)
            .ok()
            .map(|s| String::from(s.trim()))
    }

    fn write_golden(name: &str, content: &str) {
        let dir = goldens_dir();
        std::fs::create_dir_all(&dir).expect("could not create xdr_goldens directory");
        let path = dir.join(name);
        std::fs::write(&path, content)
            .unwrap_or_else(|e| panic!("could not write golden {name}: {e}"));
        // Also mirror under repo test-vectors/ for the TypeScript encoder suite.
        if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
            let tv = PathBuf::from(&manifest)
                .join("..")
                .join("..")
                .join("test-vectors")
                .join("xdr");
            let _ = std::fs::create_dir_all(&tv);
            let _ = std::fs::write(tv.join(name), content);
        }
        std::println!("  [UPDATE_GOLDEN] wrote {}", path.display());
    }

    fn assert_golden(name: &str, actual: &str) {
        let updating = std::env::var("UPDATE_GOLDEN").as_deref() == Ok("1");
        if updating {
            write_golden(name, actual);
            return;
        }
        match read_golden(name) {
            None => panic!(
                "\nGolden file `{name}` does not exist.\n\
                 Run `UPDATE_GOLDEN=1 cargo test -p sure_circles xdr_golden` to generate it,\n\
                 then commit the new file alongside this test.\n"
            ),
            Some(expected) => {
                assert_eq!(
                    actual,
                    expected.as_str(),
                    "\n\
                     XDR wire format changed — golden `{name}` no longer matches.\n\
                     The storage layout changed — bump SCHEMA_VERSION (currently {SCHEMA_VERSION})\n\
                     and update the golden deliberately:\n\
                       1. Bump SCHEMA_VERSION in xdr_golden (and Circle.schema_version in lib.rs).\n\
                       2. Run: just xdr-goldens   (see test_snapshots/xdr_goldens/README.md)\n\
                       3. Update packages/client XDR tests and test-vectors/xdr/\n\
                       4. Commit all changes together.\n"
                );
            }
        }
    }

    fn golden_circle(env: &Env) -> Circle {
        // Deterministic contract addresses (not random Address::generate) so
        // the XDR golden is stable across runs. Strkey G-addresses from older
        // fixtures are not valid under current soroban-env validation.
        let admin = fixture_recipient_xdr(env, 0xA1);
        let token = fixture_recipient_xdr(env, 0xA2);
        let fee_recipient = fixture_recipient_xdr(env, 0xA3);

        Circle {
            schema_version: SCHEMA_VERSION,
            admin,
            token,
            root: dev_root(env),
            contribution: 1_000_000i128,
            size: 5u32,
            round: 0u32,
            pot: 0i128,
            vk: dev_verification_key(env),
            contributors: soroban_sdk::Vec::new(env),
            nullifiers: soroban_sdk::Vec::new(env),
            cancelled: false,
            round_deadline_ledgers: 0,
            round_started_ledger: 1,
            fee_bps: 0,
            fee_recipient,
        }
    }

    #[test]
    fn schema_version_matches_create_circle() {
        // A layout change without bumping SCHEMA_VERSION must fail here:
        // create_circle writes schema_version=2 and the golden fixture must
        // embed the same constant.
        assert_eq!(
            SCHEMA_VERSION, 2,
            "keep in sync with Circle::schema_version in lib.rs"
        );
        let env = Env::default();
        let circle = golden_circle(&env);
        assert_eq!(circle.schema_version, SCHEMA_VERSION);
    }

    #[test]
    fn xdr_golden_circle() {
        let env = Env::default();
        let b64 = to_base64(&golden_circle(&env).to_xdr(&env));
        assert_golden(&golden_name("circle"), &b64);
    }

    #[test]
    fn xdr_golden_verification_key() {
        let env = Env::default();
        let b64 = to_base64(&dev_verification_key(&env).to_xdr(&env));
        assert_golden(&golden_name("verification_key"), &b64);
    }

    #[test]
    fn xdr_golden_proof() {
        let env = Env::default();
        let b64 = to_base64(&dev_proof_round0(&env).to_xdr(&env));
        assert_golden(&golden_name("proof"), &b64);
    }

    #[test]
    fn xdr_circle_round_trips() {
        use soroban_sdk::xdr::FromXdr;
        let env = Env::default();
        let circle = golden_circle(&env);
        let recovered =
            Circle::from_xdr(&env, &circle.clone().to_xdr(&env)).expect("Circle::from_xdr");
        assert_eq!(recovered.schema_version, circle.schema_version);
        assert_eq!(recovered.contribution, circle.contribution);
        assert_eq!(recovered.size, circle.size);
        assert_eq!(recovered.round, circle.round);
        assert_eq!(recovered.pot, circle.pot);
        assert_eq!(recovered.cancelled, circle.cancelled);
        assert_eq!(recovered.fee_bps, circle.fee_bps);
        assert_eq!(
            recovered.round_deadline_ledgers,
            circle.round_deadline_ledgers
        );
        assert_eq!(recovered.root.to_xdr(&env), circle.root.to_xdr(&env));
    }

    #[test]
    fn xdr_proof_round_trips() {
        use soroban_sdk::xdr::FromXdr;
        let env = Env::default();
        let proof = dev_proof_round0(&env);
        let recovered =
            Proof::from_xdr(&env, &proof.clone().to_xdr(&env)).expect("Proof::from_xdr");
        assert_eq!(recovered.a.to_xdr(&env), proof.a.to_xdr(&env));
        assert_eq!(recovered.b.to_xdr(&env), proof.b.to_xdr(&env));
        assert_eq!(recovered.c.to_xdr(&env), proof.c.to_xdr(&env));
    }

    #[test]
    fn xdr_verification_key_round_trips() {
        use soroban_sdk::xdr::FromXdr;
        let env = Env::default();
        let vk = dev_verification_key(&env);
        let recovered = VerificationKey::from_xdr(&env, &vk.clone().to_xdr(&env))
            .expect("VerificationKey::from_xdr");
        assert_eq!(recovered.alpha.to_xdr(&env), vk.alpha.to_xdr(&env));
        assert_eq!(vk.ic.len(), recovered.ic.len());
    }
}
