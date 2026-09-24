# weighted-ballot-tabulation

Upgrade integrated runElection(candidates,ballots) in src/election.mjs from first-choice plurality to this project's fixed weighted instant-runoff policy, through tabulate in src/tabulate.mjs and existing renderReport consumer. This is a synthetic project policy, not election-law advice. Domain:<=50 unique ASCII-letter candidate names1..20 chars, dense<=1000 ballots {ranking:unique subset array of candidate names,weight:integer0..1000000}; empty rankings allowed, frozen inputs unchanged. Invalid candidates TypeError('candidate'), invalid ballots TypeError('ballot'), all validation before rounds. Each round lists remaining candidates sorted default JS UTF16 order and assigns each ballot weight to its first remaining ranked candidate. Others exhausted. activeWeight sums assigned, exhaustedWeight=all original weight-activeWeight. Strict majority (>activeWeight/2) wins; zero activeWeight stops with winner null. Otherwise eliminate ONE lowest-vote candidate, breaking low-vote tie by lexicographically largest name, then reassign next round. Return {winner,rounds}; each round {totals:[{candidate,votes}],activeWeight,exhaustedWeight,eliminated}, eliminated null for terminal round. Empty candidate set=>null winner, no rounds (ballots must still validate). Report exact existing format: each round row tab-separated roundNumber, comma-joined name:votes, activeWeight, exhaustedWeight, eliminated-or'-'; final row 'winner\tNAME' or '-', LF join/no trailing LF. Keep runElection returning result plus report; no plurality shortcut, tie randomness or retained eliminated-candidate votes.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert transfers change plurality winner and complete round/report output.
- Assert exhaustion-adjusted majority, deterministic tie elimination, zero active weight, empty and invalid ballots.

Update project documentation to explain:
- Document exact project majority/elimination/tie policy and exhaustion.
- Explain round audit/report format, input domain and absence of legal/general-election claims.

Run npm test after the last source or test change.
