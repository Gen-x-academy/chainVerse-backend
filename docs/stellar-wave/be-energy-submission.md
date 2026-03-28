# BeEnergy Submission Notes

## Project

- Name: `BeEnergy`
- Hub project id: `63`
- Hub slug: `beenergy`
- Hub status after submission: `submitted`
- Category: `infrastructure`
- Stellar network: `testnet`
- Stellar admin account: `GCHCYTHV4JSIJNCN56EIEXZNTB6JUHYX25FTSYFOM4DDVGV7UXWOHLCW`
- Soroban contracts:
  - `CCYOVOFDJ5BVBSI6HADLWETTUF3BU423MEAWBSBWV2X5UVNKSJMRPBA6` (`energy_token`)
  - `CBTDPLFNFGWVOD4HXDKW4EH5L3D2YGOY5CWTFCJM5TEWFL4VQTNX2UDZ` (`energy_distribution`)
  - `CCH2EXXNSDW2BAKBIPFAG6CCZS6LV4VJFUP2CZZCW5LEY4JOAXBJD6YI` (`community_governance`)

## Why it fits the issue

BeEnergy is a Stellar Wave project with a clear social-impact mission centered on renewable-energy inclusion. The project helps energy cooperatives and small prosumers manage members, meters, readings, and certificate issuance, then tokenize production on Stellar as 1 kWh proto-certificates. That directly supports community-scale clean-energy projects that would otherwise struggle to prove generation and participate in certificate markets.

The beneficiary population is explicit in the public docs: renewable-energy cooperatives, their members, and small local producers whose generation can be certified and surfaced to outside buyers. The fund distribution model is also documented on-chain. The `energy_distribution` contract records generation and allocates certificates proportionally to cooperative members by participation percentage, while buyers retire certificates later as verifiable proof of purchase. Payment is handled off-chain, but the production, mint, allocation, and retirement evidence lives on Stellar Testnet.

The project publishes measurable impact signals in its public testing docs. Its end-to-end purchase simulation reports a February 2026 scenario with 3 prosumers, 4,704 readings, 2,102.1 kWh of certified solar generation, and about 841 kg of avoided CO2. Those figures are published testnet/demo metrics rather than audited production totals, so they should be described that way, but they still show a concrete model for positive social impact.

## Verification

- Stellar Wave membership:
  - Drips org page for `BuenDia-Builders` shows `BuenDia-Builders/be-energy` as an approved Stellar Wave repo.
- Public project docs:
  - README states the mission as renewable-energy certification infrastructure on Stellar.
  - README and contract docs publish the three deployed Soroban contract IDs and the admin account.
- On-chain verification:
  - Horizon Testnet resolves the admin account `GCHCYTHV4JSIJNCN56EIEXZNTB6JUHYX25FTSYFOM4DDVGV7UXWOHLCW`.
  - Stellar Expert API resolves the `energy_token` contract and shows the same account as creator.
  - Published testnet transactions for mint and burn:
    - Mint: `09238d0f647804fa896774524128dabcf9b226d1e310ad00830064a25dcc710a`
    - Burn: `aaaf99f7ba60822d999de0b00d4ec0428f5849a588a80ce343722617ca270f0a`
- Hub lifecycle check:
  - `POST /api/projects` succeeded and returned project `63` with status `submitted` on `2026-03-28T10:14:33.478Z`.
  - `GET /api/projects/63` and `GET /api/projects/beenergy` both resolve publicly.
  - `GET /api/projects/pending` returned `403 Forbidden` for the available contributor token on March 28, 2026, so the pending-queue check could not be independently confirmed from this account.

## Source links

- Drips org page: `https://www.drips.network/wave/orgs/b04a925a-90e6-4ef6-adc5-120f2974ca5d`
- GitHub repo: `https://github.com/BuenDia-Builders/be-energy`
- README: `https://github.com/BuenDia-Builders/be-energy/blob/main/README.md`
- Contract reference: `https://github.com/BuenDia-Builders/be-energy/blob/main/docs/5-CONTRACTS.md`
- Testing docs: `https://github.com/BuenDia-Builders/be-energy/blob/main/docs/8-TESTING.md`
- Hub project endpoint: `https://usestellarwavehub.vercel.app/api/projects/63`
- Hub slug endpoint: `https://usestellarwavehub.vercel.app/api/projects/beenergy`
- Horizon account lookup: `https://horizon-testnet.stellar.org/accounts/GCHCYTHV4JSIJNCN56EIEXZNTB6JUHYX25FTSYFOM4DDVGV7UXWOHLCW`
- Stellar Expert contract lookup: `https://stellar.expert/explorer/testnet/contract/CCYOVOFDJ5BVBSI6HADLWETTUF3BU423MEAWBSBWV2X5UVNKSJMRPBA6`
- Mint transaction: `https://stellar.expert/explorer/testnet/tx/09238d0f647804fa896774524128dabcf9b226d1e310ad00830064a25dcc710a`
- Burn transaction: `https://stellar.expert/explorer/testnet/tx/aaaf99f7ba60822d999de0b00d4ec0428f5849a588a80ce343722617ca270f0a`
