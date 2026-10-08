# Share the option normalizer

Refactor the duplicated option normalization in textReport and jsonReport into a new src/options.mjs module. Both entrypoints must import and use the same exported normalizer function, and must delegate validation to it instead of retaining local copies. The exported helper name and named/default export style are your choice. Each entrypoint must call that shared normalizer once and use its result for rendering.

Preserve the existing API and all behavior: omitted options or omitted fields use attempts=3 and timeout=250. Attempts must be an integer from 1 through 10. Timeout must be a finite number >=0; zero is valid. Invalid values throw RangeError. textReport returns `attempts=N; timeout=M`, jsonReport returns exactly {attempts,timeout}. Inputs are not mutated. This is a behavior-preserving refactor; tests of the old behavior already pass. The separate structural requirement is part of the task.

Run `npm test` and `git diff --check` after the final change. Ordinary tests are public and may be extended. Keep their existing contract coverage. Use Node.js 24 and the standard library; no dependency installation is needed.
