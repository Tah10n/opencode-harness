# feature-rollout-context

ASCII FNV-1a hashes seed:user into 10000 buckets; a bucket strictly below basisPoints is enabled. Global disabled wins, then own explicit overrides, then rollout. The consumer returns sorted own flag names without modifying flags.
