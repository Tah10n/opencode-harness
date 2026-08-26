Host-owned verification component. The runner tracks mutation revision,
selects the narrowest applicable trusted project check by catalog-owned ID,
invalidates prior verification after a new mutation, and blocks terminal
success until the final workspace is passed or no trusted check applies.
Executable and argv remain outside model control. Reviewer behavior is absent
from this arm and evaluated separately.
