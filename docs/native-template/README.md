# Native OpenCode template (opt-in)

A short reusable workflow for changes across existing execution paths. The bundle
adds instructions to ordinary OpenCode; it installs no runtime, custom tools,
reviewer, scheduler or provider integration. Effectiveness remains unproven.

With Node 24, from this checkout, choose a new absolute output directory whose
parent exists:

```sh
npm run profile:materialize -- --native --profile core --output /absolute/harness-config
```

From your existing project:

```sh
OPENCODE_CONFIG_DIR=/absolute/harness-config opencode
```

Choose your model and task normally. OpenCode retains its native agent, tools,
sessions, authorization and permissions. The two files are `opencode.json` and
`core.md`; the config contains only `$schema` and an absolute `instructions` path.
The template supplies no execution isolation; follow the project's own controls.

Disable by removing this environment setting, or restore its previous value if
already exported. If you already use a configuration directory, append the
absolute generated `core.md` path to its `instructions` array. Do not overwrite
your config. Rematerialize after moving the bundle. Existing output is refused,
including symlinks; this opt-in path supports only `core` and no `--force`.
Historical materialization, default profile and launchers remain unchanged.

The workflow makes a behavior regression part of implementation and checks that
required tests ship. It scales down for nonbehavioral changes. A failing new test
is evidence of sensitivity, not proof of a correct expectation or authority to
change compatibility. Initial local validation used zero model/provider calls;
the later six-session development comparison is reported below.

```sh
npm run verify:native-template
npm run verify:native-template:config
```

The second check needs an installed OpenCode (`OPENCODE_BIN` can select it). It
runs only `debug config` and `debug agent build` with fresh config/data directories,
no credentials and fetching disabled. It verifies resolved instruction bytes,
native tools and project permission coexistence. It does not send a provider
request or prove delivery in a model prompt, compliance or quality improvement.

[Development outcomes, exact old bytes and trace diagnosis](DEVELOPMENT.md) and
[portable diagnostic examples](diagnostics/README.md) are evidence outside the
installed bundle. No new evaluation, merge, release or default switch is implied.

[Second development batch on the published revision](REVISION-DEVELOPMENT-RESULTS.md):
six new observations, no complete-delivery improvement; instruction bytes remain
unchanged after the result. The original evidence above remains historical.

[Separate review and one repair on the saved on-patches](REVIEW-REPAIR-RESULTS.md):
six reviews and three repairs found and fixed specific defects, but original
obligations remain incomplete and one repair introduced a state-validation
regression. No plugin or runtime is added; the effectiveness goal stays open.

[Enable the optional `/harness-review` command](NATIVE-REVIEW.md) with
`--native --review`. Use a new native session; review is diagnostic and never
schedules repair. Omitting `--review` preserves the two-file mode above.
