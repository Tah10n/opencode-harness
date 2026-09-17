[Select] Aria error flagged by WAVE and W3C
<!-- Provide a general summary of the issue in the Title above -->
WAVE errors in tables, in TablePagination/TableFooter
<!--
  Thank you very much for contributing to Material-UI by creating an issue! ❤️
  To avoid duplicate issues we ask you to check off the following list.
-->

<!-- Checked checkbox should look like this: [x] -->

- [ x] The issue is present in the latest release.
- [x ] I have searched the [issues](https://github.com/mui-org/material-ui/issues) of this repository and believe that this is not a duplicate.

## Current Behavior 😯
1. Go to https://material-ui.com/components/tables/
2. Run WAVE
3. Should not get errors from standard components 
<!-- Describe what happens instead of the expected behavior. -->
WAVE identifies 3 "Broken ARIA Reference Errors" associated with three demos
- Sorting & Selection
- Fixed Headers
- Editable Example - this is a material-table which seems to inherit the accessibility bug from TableFooter 


## Expected Behavior 🤔
No WAVE errors
<!-- Describe what should happen. -->
No WAVE errors
## Steps to Reproduce 🕹
Given above
<!--
  Provide a link to a live example (you can use codesandbox.io) and an unambiguous set of steps to reproduce this bug.
  Include code to reproduce, if relevant (which it most likely is).

  You should use the official codesandbox template as a starting point: https://material-ui.com/r/issue-template

  If you have an issue concerning TypeScript please start from this TypeScript playground: https://material-ui.com/r/ts-issue-template

  Issues without some form of live example have a longer response time.
-->

Steps:

1.
2.
3.
4.

## Context 🔦

<!--
  What are you trying to accomplish? How has this issue affected you?
  Providing context helps us come up with a solution that is most useful in the real world.
-->

## Your Environment 🌎
OSX Mojave, Chrome v80, WAVE v3.0.4
<!--
  Include as many relevant details about the environment with which you experienced the bug.
  If you encounter issues with typescript please include version and tsconfig.
-->

| Tech        | Version |
| ----------- | ------- |
| Material-UI | v4.9.6  |
| React       |         |
| Browser     |         |
| TypeScript  |         |
| etc.        |         |



Environment (identical for P/H0/H1):
External network is unavailable to tools. Project dependencies are prepared. The project uses Node 18.8.0 and npm 8.18.0. Use the original package.json scripts and public project tests/docs. Diagnostic tooling is separate from the project toolchain.
For the project shell, the prepared startup is `. /usr/local/nvm/nvm.sh && nvm use 18.8.0`.
