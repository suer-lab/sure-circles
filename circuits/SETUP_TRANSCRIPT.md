# DEVELOPMENT / TEST SETUP — NOT FOR PRODUCTION

This is a **single-machine development setup and does not provide the trust assumptions of a production
multi-party ceremony.** One person on one machine ran both Phase 1 and Phase 2 and could have retained the
contribution randomness. Do not use these keys for anything that holds real value. A production ceremony is a
separate, later task.

Contribution entropy is generated fresh from the operating system's CSPRNG for each run and is never stored or
printed, so it does not appear in this transcript.

## Environment

| | |
| --- | --- |
| Generated at | 2026-11-05T10:13:51.228Z |
| Platform | Windows_NT 10.0.19045 (win32 x64) |
| Node.js | v22.20.0 |
| npm | 11.21.1 |
| Circom | circom compiler 2.2.3 |
| Circom binary SHA-256 | `e43f132ee6f0aa79b705beceb59c2a7e6a54d7bdeab917ca34e9fc1951d185e1` |
| snarkjs (library, not CLI) | 0.7.6 |

## Circuit

| | |
| --- | --- |
| Template SHA-256 (`membership.template.circom`) | `13486209550e522851ef923a658a4587561d53d3d3bc7234b2d0703b00252e29` |
| Config SHA-256 (`config.json`) | `dc2d38d48c569f4d53184327ef000ecdba52721d732455632f7eeb458606cacb` |
| Generated circuit SHA-256 (`membership.circom`) | `bb29c23e0662eb015db51728c058c22de4c148990a897eb2ab99ec38a09ba9af` |
| Merkle depth | 4 |
| Constraints | 3757 |
| Wires | 3766 |
| Public inputs / private inputs / outputs | 3 / 10 / 1 |
| Public signal order | nullifierHash, root, externalNullifier, recipientHash |
| R1CS SHA-256 | `c58e4a33c22a9231266b7e6d93ae031b372ec9e7740dc1e323f0c135b79666d0` |
| Sym SHA-256 | `6226453316f6bb0b964260f7005458b55858fcfe188d9db6419034ccb8969188` |
| Witness WASM SHA-256 | `400c9307b73629f1fb644e17e84912bb2b4b06a55823bbd6aed9ac9dd25a708a` |

## Powers of Tau (Phase 1)

Power 13 (2^13 = 8192). The circuit needs at least
power 12; one extra power was added as headroom. One local contribution, then
`prepare phase2`, then snarkjs verification of the prepared file (passed).

## Ceremony stages

| Stage | File | SHA-256 |
| --- | --- | --- |
| powersoftau new | DEV_pot13_0000.ptau | d53840d7be4a3c7649d0409bd744071c51e934de3df638268af468f9cafc997c |
| powersoftau contribute | DEV_pot13_0001.ptau | 452a2a63023cc12a778e9f4da1fc8527d59e94c0822da05f9fb3dea24af50626 |
| powersoftau prepare phase2 | DEV_pot13_final.ptau | 6c07daadcf1298ee14f25f7db6379f40dd3246b268fcd7ee0585ee145cb21b48 |
| zkey new (zero contributions) | membership_DEV_0000.zkey | 6603756f4248e9a29fd2aadf9d28e0a01a1b84cef5ecceca0a7fffc6d5e58ef2 |
| zkey contribute (final DEV zkey) | membership_DEV_final.zkey | 0dd6142a160bdd643fc6b5e4ea39e33f54dac05bcfba4b70dec25da088808572 |
| verification key export | verification_key.json | 338833959f832571f5b6c84510945576da6e2644038d9a602dd3354c945a00ec |

## Final DEV artifacts

| Artifact | SHA-256 |
| --- | --- |
| `build/membership_DEV_final.zkey` | `0dd6142a160bdd643fc6b5e4ea39e33f54dac05bcfba4b70dec25da088808572` |
| `verification_key.json` | `338833959f832571f5b6c84510945576da6e2644038d9a602dd3354c945a00ec` |
| `build/dev-setup/DEV_pot13_final.ptau` | `6c07daadcf1298ee14f25f7db6379f40dd3246b268fcd7ee0585ee145cb21b48` |

`snarkjs zkey verify` (library `zKey.verifyFromR1cs`) against the R1CS and the prepared Powers of Tau: **passed**.

## snarkjs contribution output (public hashes only)

```
First Contribution Hash:
		c93aa3e0 5fc2bccf 14a8bae8 93b0cfbc
		83eebb2f 628c366d be7407b3 7798f7c2
		73e13081 90642fd0 ed3a5503 9cf701e6
		5182189d e5ee8375 a62fa62d ac11cf08
Contribution Response Hash imported:
		8b8ea95e d1cc32a4 e4406d82 c7f35c15
		44298555 106d310a 5c7fde4e 418adee8
		f6c07e4f ffcd6959 f8991a12 a12e339d
		da4edac7 4840bfd9 d9853604 c981a107
Next Challenge Hash:
		e94b0b00 e5c7fe90 5976a7d9 d48b36ac
		b2523c52 a775b19b e45a5524 caa1fe20
		b21b81c4 8c207105 4a6897d8 114397d4
		4ca7fc4a 918e529d d7eb7344 30d0793a
Powers Of tau file OK!
Next challenge hash:
		e94b0b00 e5c7fe90 5976a7d9 d48b36ac
		b2523c52 a775b19b e45a5524 caa1fe20
		b21b81c4 8c207105 4a6897d8 114397d4
		4ca7fc4a 918e529d d7eb7344 30d0793a
Contribution #1: Sure Circles DEV contribution 1 (NOT FOR PRODUCTION)
Response Hash:
		8b8ea95e d1cc32a4 e4406d82 c7f35c15
		44298555 106d310a 5c7fde4e 418adee8
		f6c07e4f ffcd6959 f8991a12 a12e339d
		da4edac7 4840bfd9 d9853604 c981a107
Response Hash:
		c93aa3e0 5fc2bccf 14a8bae8 93b0cfbc
		83eebb2f 628c366d be7407b3 7798f7c2
		73e13081 90642fd0 ed3a5503 9cf701e6
		5182189d e5ee8375 a62fa62d ac11cf08
Powers of Tau Ok!
Circuit hash:
		e1b09d78 11c67d86 105b5d43 893309aa
		2db3c8a8 13f6f83b c6c09734 6be6be5c
		ef1a7dc1 84b04938 4f5615ea 871a7d7f
		721ac8f9 0adadf36 7f1c44c8 4631eadb
Circuit Hash:
		e1b09d78 11c67d86 105b5d43 893309aa
		2db3c8a8 13f6f83b c6c09734 6be6be5c
		ef1a7dc1 84b04938 4f5615ea 871a7d7f
		721ac8f9 0adadf36 7f1c44c8 4631eadb
Contribution Hash:
		dbd2c981 42919526 1983583f c8c6b5c4
		d7403290 9c9b2434 30ae1b04 2d373378
		ec42b3c1 7057a6c4 3ea79042 1f26aef9
		5d6554d5 e5147d8c 76e87c95 b615e3ab
Circuit hash:
		e1b09d78 11c67d86 105b5d43 893309aa
		2db3c8a8 13f6f83b c6c09734 6be6be5c
		ef1a7dc1 84b04938 4f5615ea 871a7d7f
		721ac8f9 0adadf36 7f1c44c8 4631eadb
Circuit Hash:
		e1b09d78 11c67d86 105b5d43 893309aa
		2db3c8a8 13f6f83b c6c09734 6be6be5c
		ef1a7dc1 84b04938 4f5615ea 871a7d7f
		721ac8f9 0adadf36 7f1c44c8 4631eadb
contribution #1 Sure Circles DEV zkey contribution 1 (NOT FOR PRODUCTION):
		dbd2c981 42919526 1983583f c8c6b5c4
		d7403290 9c9b2434 30ae1b04 2d373378
		ec42b3c1 7057a6c4 3ea79042 1f26aef9
		5d6554d5 e5147d8c 76e87c95 b615e3ab
```
