# plugin-hook-composition

Validate the complete graph before execution. Unknown/duplicate IDs throw TypeError; cycles throw Error("cycle"). Select the earliest currently eligible hook each step. Hooks await sequentially; stop adopts its value and suppresses later hooks. Thrown/rejected errors propagate unchanged.
