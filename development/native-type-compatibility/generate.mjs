// Development-only, baseline declarations -> bounded consumer candidates.
// This module has no filesystem access and receives no evaluator, candidate,
// reference, labels, historical diagnostics, or task-specific names.
export function generate(ts, analyze) {
  const limits = { genericParameters: 2, rootSeeds: 18, methods: 60, depth: 3, nodes: 160, consumers: 24 };
  const specimens = ['string', '{ sample: [string] }', '{ marker: string }'];
  const skipped = [], roots = [], calls = [], consumers = [];
  const initial = analyze("import * as Surface from './index';\n", 'exports');
  if (initial.diagnostics.length) return { limits, specimens, roots, consumers, skipped, preparationError: initial.diagnostics };
  const { checker, source } = initial;
  const module = checker.getSymbolAtLocation(source.statements[0].moduleSpecifier);
  const exports = checker.getExportsOfModule(module);
  const seen = new Set();
  for (const exported of exports) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    const declaration = symbol.declarations?.find(ts.isClassDeclaration);
    if (!declaration) { skipped.push({ path: exported.name, reason: 'unsupported export (only exported classes)' }); continue; }
    const arity = declaration.typeParameters?.length || 0;
    if (arity > limits.genericParameters) { skipped.push({ path: exported.name, reason: 'generic parameter bound' }); continue; }
    let combinations = [[]];
    for (let i = 0; i < arity; i++) combinations = combinations.flatMap(c => specimens.map(s => [...c, s]));
    for (const arguments_ of combinations) {
      if (roots.length >= limits.rootSeeds) { skipped.push({ path: exported.name, reason: 'root seed bound' }); break; }
      const id = roots.length, typeArguments = arguments_.length ? `<${arguments_.join(', ')}>` : '';
      roots.push({ id, export: exported.name, typeArguments, import: `import { ${exported.name} as API${id} } from './index';`, declaration: `declare const subject${id}: API${id}${typeArguments};` });
    }
  }
  const rootText = roots.map(r => `${r.import}\n${r.declaration}`).join('\n') + '\n';
  const instantiated = analyze(rootText, 'roots');
  const variables = program => program.source.statements.filter(ts.isVariableStatement).flatMap(s => s.declarationList.declarations);
  const byName = new Map(variables(instantiated).map(d => [d.name.getText(), d]));
  function issue(path, reason) { skipped.push({ path, reason }); }
  function value(type, c, depth = 0) {
    if (depth > limits.depth) throw Error('argument depth bound');
    if (type.flags & ts.TypeFlags.TypeParameter) {
      const constraint = c.getBaseConstraintOfType(type);
      if (!constraint || constraint === type) throw Error('unresolved generic argument');
      return value(constraint, c, depth + 1);
    }
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never | ts.TypeFlags.Conditional)) throw Error('unresolved/any/unknown/never/conditional argument');
    if (type.isUnion()) return value(type.types[0], c, depth + 1);
    if (type.flags & ts.TypeFlags.StringLiteral) return JSON.stringify(type.value);
    if (type.flags & ts.TypeFlags.NumberLiteral) return String(type.value);
    if (type.flags & ts.TypeFlags.String) return '"sample"';
    if (type.flags & ts.TypeFlags.Number) return '1';
    if (type.flags & ts.TypeFlags.BooleanLike) return type.intrinsicName === 'false' ? 'false' : 'true';
    throw Error('unsupported argument shape');
  }
  function argumentsFor(signature, c) {
    const args = [];
    for (const parameter of signature.parameters) {
      const d = parameter.valueDeclaration || parameter.declarations?.[0];
      if (d?.questionToken || d?.initializer) break;
      const type = c.getTypeOfSymbolAtLocation(parameter, d);
      if (d?.dotDotDotToken) {
        if (!c.isTupleType(type)) throw Error('non-concrete rest tuple');
        for (const element of c.getTypeArguments(type)) args.push(value(element, c));
      } else args.push(value(type, c));
    }
    return args.join(', ');
  }
  for (const root of roots) {
    const node = byName.get(`subject${root.id}`);
    const errors = instantiated.rawDiagnostics.filter(d => d.file === instantiated.source && d.start >= node.parent.parent.getStart() && d.start < node.end);
    if (errors.length) { issue(root.export + root.typeArguments, 'generic seed rejected by compiler'); continue; }
    root.accepted = true;
    const type = instantiated.checker.getTypeAtLocation(node.name);
    for (const property of instantiated.checker.getPropertiesOfType(type)) {
      const d = property.valueDeclaration || property.declarations?.[0];
      if (d?.modifiers?.some(m => [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(m.kind))) continue;
      const signatures = instantiated.checker.getTypeOfSymbolAtLocation(property, node).getCallSignatures();
      if (!signatures.length) continue;
      const route = `${root.export}${root.typeArguments}.${property.name}`;
      if (signatures.length !== 1) { issue(route, 'unsupported overloads'); continue; }
      try {
        const args = argumentsFor(signatures[0], instantiated.checker);
        if (calls.length >= limits.methods) { issue(route, 'method bound'); continue; }
        calls.push({ root, route, method: property.name, args, expression: `subject${root.id}[${JSON.stringify(property.name)}](${args})` });
      } catch (error) { issue(route, error.message); }
    }
  }
  const callText = rootText + calls.map((c, i) => `const returned${i} = ${c.expression};`).join('\n') + '\n';
  const resolved = analyze(callText, 'returns');
  const returned = new Map(variables(resolved).map(d => [d.name.getText(), d]));
  let nodes = 0;
  function walk(type, expression, call, node, depth) {
    if (++nodes > limits.nodes || depth > limits.depth) { issue(call.route + expression, 'traversal bound'); return; }
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never | ts.TypeFlags.Conditional | ts.TypeFlags.TypeParameter)) { issue(call.route + expression, 'unresolved return type'); return; }
    const signatures = type.getCallSignatures();
    if (signatures.length) {
      if (signatures.length !== 1 || signatures[0].typeParameters?.length) { issue(call.route + expression, 'unsupported callable overload/generic'); return; }
      try {
        const args = argumentsFor(signatures[0], resolved.checker);
        if (consumers.length >= limits.consumers) { issue(call.route + expression, 'consumer bound'); return; }
        const text = `${call.root.import}\n${call.root.declaration}\nconst returned = ${call.expression};\nconst callable = ${expression};\ncallable(${args});\n`;
        consumers.push({ id: consumers.length, provenance: 'generated from baseline only', export: call.root.export, typeArguments: call.root.typeArguments, method: call.method, route: call.route + '() -> ' + expression, arguments: call.args, callbackArguments: args, baselineThis: signatures[0].thisParameter ? resolved.checker.typeToString(resolved.checker.getTypeOfSymbolAtLocation(signatures[0].thisParameter, node)) : null, text });
      } catch (error) { issue(call.route + expression, error.message); }
      return;
    }
    if (resolved.checker.isArrayType(type) || resolved.checker.isTupleType(type)) {
      const element = resolved.checker.getIndexTypeOfType(type, ts.IndexKind.Number);
      if (element) walk(element, expression + '[0]', call, node, depth + 1);
    } else if (type.flags & ts.TypeFlags.Object) {
      if (type.symbol?.declarations?.some(ts.isClassDeclaration)) { issue(call.route, 'class-return recursion not traversed'); return; }
      for (const property of resolved.checker.getPropertiesOfType(type)) {
        walk(resolved.checker.getTypeOfSymbolAtLocation(property, node), expression + `[${JSON.stringify(property.name)}]`, call, node, depth + 1);
      }
    } else if (type.isUnionOrIntersection()) issue(call.route, 'unsupported return union/intersection');
  }
  calls.forEach((call, i) => {
    const node = returned.get(`returned${i}`);
    const errors = resolved.rawDiagnostics.filter(d => d.file === resolved.source && d.start >= node.parent.parent.getStart() && d.start < node.end);
    if (errors.length) { issue(call.route, 'method specimen rejected by compiler'); return; }
    walk(resolved.checker.getTypeAtLocation(node.name), 'returned', call, node, 0);
  });
  return { limits, specimens, exports: exports.map(s => s.name), roots, consumers, skipped, nodes };
}
