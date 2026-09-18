# promise-finalizer-errors

wrap offers chainable then/catch/finally and normal await/Promise.resolve assimilation. A function finalizer runs once with no arguments after either outcome, with undefined thisArg under ordinary receiver rules. Its returned thenable is awaited. Successful cleanup preserves the original value/reason identity and ignores its own value; a cleanup throw/rejection overrides either original outcome. Nonfunctions are ignored without assimilation. Branches are independent; no custom Promise species/representation is promised. Run npm test.
