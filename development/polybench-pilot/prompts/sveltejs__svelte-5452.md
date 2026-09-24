Destructuring into a store doesn't work since 3.26
**Describe the bug**
Please look at the repl code to see what's going on.
I'm trying to destructure two properties into stores which fails for the second value. It works for the first though.

**To Reproduce**
https://svelte.dev/repl/ee374115fae74168916e62549aa751a9?version=3.26.0

**Expected behavior**
Destructuring works with as many peoperties as necessary

**Information about your Svelte project:**
This happens in FF80 and Electron 10

- OS X 

- 3.26
- Rollup

**Severity**
I could work around this issue

**Additional context**
3.25.1 works as expected



Environment (identical for P/H0/H1):
External network is unavailable to tools. Project dependencies are prepared. The project uses Node 16.20.2 and npm 8.19.4. Use the original package.json scripts and public project tests/docs. Diagnostic tooling is separate from the project toolchain.
For the project shell, the prepared startup is `. /usr/local/nvm/nvm.sh && nvm use 16.20.2`.
