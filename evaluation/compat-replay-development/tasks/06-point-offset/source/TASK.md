# Add translation after scaling

compatible extension. Support options.offset [x,y] on transform(points,options), applied after scaling.

Preserve: Omitted offset keeps scale default 1 and explicit scale 0; preserve point order and nested inputs. Domain nonnegative finite integer coordinates and scales 0..10.

Allowed changes: Explicit offset translates the scaled point.

Run `npm test`. Add focused tests for the requested change and preserved cases. `compat.json` declares the fixed public preservation corpus; it excludes the new behavior and is not task acceptance.
