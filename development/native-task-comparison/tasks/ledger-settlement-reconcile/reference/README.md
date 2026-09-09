# ledger-settlement-reconcile

Validate unique IDs and earlier original-only reversals before aggregation. A reversal must exactly negate its original in the same account/currency, once only. Sum all entries; retain zero-net accounts. Sort currencies/accounts and compute balanced separately per currency, never by combining currencies.
