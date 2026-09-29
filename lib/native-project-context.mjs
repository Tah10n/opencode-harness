// A: bounded TypeScript compiler analysis over a permission-filtered snapshot.
// The compiler host never follows imports onto the host filesystem.
import path from 'node:path';
import {sourcePath, testPath} from './native-project-scope.mjs';

export function createProjectContext(ts) {
  let previous = new Map(), parsed = new Map();
  return (scope, query, {limit = 18, maxDepth = 6} = {}) => {
    const started = performance.now(), {root, files} = scope, limits = [...scope.limits];
    const absolute = name => path.join(root, name);
    const rel = name => path.relative(root, name).split(path.sep).join('/');
    const fileExists = name => files.has(rel(name));
    const readFile = name => files.get(rel(name));
    const host = {fileExists, readFile, readDirectory: () => [...files.keys()].filter(sourcePath).map(absolute),
      directoryExists: dir => [...files.keys()].some(n => n.startsWith(rel(dir).replace(/^$/, '') + '/')) || dir === root,
      getCurrentDirectory: () => root, useCaseSensitiveFileNames: true};
    let options = {allowJs: true, noLib: true, noResolve: false, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext};
    const configName = files.has('tsconfig.json') ? 'tsconfig.json' : files.has('jsconfig.json') ? 'jsconfig.json' : null;
    if (configName) {
      const parsedConfig = ts.parseJsonConfigFileContent(ts.parseConfigFileTextToJson(configName, files.get(configName)).config ?? {}, host, root);
      options = {...options, ...parsedConfig.options, noLib: true, allowJs: true};
      if (parsedConfig.errors.length) limits.push('Some TypeScript configuration could not be resolved within this snapshot: ' + parsedConfig.errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, ' ')).join('; '));
    }
    if ([...files.keys()].some(n => /\/(?:ts|js)config[^/]*\.json$/.test(n))) limits.push('Only the root tsconfig/jsconfig is applied; nested project configurations and project references are not combined.');
    let reparsed = 0;
    for (const [name, text] of files) if (sourcePath(name) && previous.get(name) !== text) {
      parsed.set(name, ts.createSourceFile(absolute(name), text, ts.ScriptTarget.Latest, true)); reparsed++;
    }
    for (const name of parsed.keys()) if (!files.has(name)) parsed.delete(name);
    previous = new Map(files);
    const compilerHost = {...host, getSourceFile: name => parsed.get(rel(name)), getDefaultLibFileName: () => '',
      writeFile: () => {}, getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n'};
    const program = ts.createProgram([...parsed.keys()].map(absolute), options, compilerHost), checker = program.getTypeChecker();
    const location = node => { const sf = node.getSourceFile(), start = sf.getLineAndCharacterOfPosition(node.getStart(sf)); return {file: rel(sf.fileName), line: start.line + 1, column: start.character + 1}; };
    const edges = [], declarations = [], unresolved = [], dynamic = [];
    const resolveSymbol = symbol => symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    for (const sf of program.getSourceFiles()) {
      const visit = node => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text, resolved = ts.resolveModuleName(specifier, sf.fileName, options, host).resolvedModule;
          const edge = {...location(node.moduleSpecifier), specifier, kind: ts.isExportDeclaration(node) ? 're-export' : 'import', method: 'typescript-module-resolution'};
          if (resolved && files.has(rel(resolved.resolvedFileName))) edges.push({...edge, target: rel(resolved.resolvedFileName), confidence: 'resolved'});
          else unresolved.push({...edge, confidence: 'unresolved'});
        }
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(sf) === 'require')) dynamic.push({...location(node), kind: 'dynamic-import-or-require', method: 'typescript-ast', confidence: 'unresolved'});
        if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isPropertyDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
          let parent = node.parent;
          if (ts.isVariableDeclaration(node)) parent = node.parent?.parent?.parent;
          const topLevel = parent && ts.isSourceFile(parent);
          declarations.push({name: node.name.text, ...location(node.name), topLevel: Boolean(topLevel), method: 'typescript-ast', confidence: 'resolved', symbol: resolveSymbol(checker.getSymbolAtLocation(node.name))});
        }
        ts.forEachChild(node, visit);
      }; visit(sf);
    }
    const targetFile = files.has(query) ? query : null;
    const definitions = declarations.filter(d => targetFile ? d.file === targetFile : d.name === query).sort((a,b) => Number(b.topLevel) - Number(a.topLevel));
    const targets = new Set(targetFile ? [targetFile] : definitions.map(d => d.file)), symbols = new Set(definitions.map(d => d.symbol).filter(Boolean));
    const publicExports = [], references = [];
    for (const sf of program.getSourceFiles()) {
      const module = checker.getSymbolAtLocation(sf);
      if (module) for (const exported of checker.getExportsOfModule(module)) {
        const target = resolveSymbol(exported);
        if (symbols.has(target)) publicExports.push({name: exported.name, file: rel(sf.fileName), declarations: (exported.declarations ?? target?.declarations ?? []).map(location), method: 'typescript-export-symbol', confidence: 'resolved'});
      }
      const visit = node => {
        if (ts.isIdentifier(node) && symbols.has(resolveSymbol(checker.getSymbolAtLocation(node)))) references.push({...location(node), name: node.text, method: 'typescript-symbol-reference', confidence: 'resolved'});
        ts.forEachChild(node, visit);
      }; visit(sf);
    }
    const chains = [], seen = new Set(targets), queue = [...targets].map(n => [n]);
    for (let index = 0; index < queue.length; index++) {
      const chain = queue[index];
      for (const edge of edges.filter(e => e.target === chain.at(-1))) {
        if (chain.includes(edge.file)) continue;
        if (chain.length > maxDepth) { limits.push('Reverse import traversal truncated at depth ' + maxDepth); continue; }
        const next = [...chain, edge.file]; chains.push({files: next, via: edge});
        if (!seen.has(edge.file)) { seen.add(edge.file); queue.push(next); }
      }
    }
    const tests = [...seen].filter(testPath).map(file => ({file, method: 'reverse-resolved-import-path', confidence: 'resolved'}));
    const entryPoints = scope.packages.flatMap(p => {
      const collect = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(collect) : [];
      return ['main', 'module', 'bin', 'exports'].flatMap(field => collect(p.value[field]).map(value => ({file: path.posix.normalize(path.posix.join(p.directory, value)), source: p.file, field, method: 'package-entry-declaration'})));
    }).filter(e => seen.has(e.file));
    const checks = [...new Set([...seen].map(n => scope.packageFor(n)).filter(Boolean))].flatMap(p =>
      Object.entries(p.value.scripts ?? {}).filter(([name]) => /^(test(?::.*)?|typecheck|check|lint|build)$/.test(name)).map(([name, command]) => ({source: p.file, script: name, command})));
    const take = rows => ({items: rows.slice(0, limit), total: rows.length, truncated: rows.length > limit});
    limits.push('Static imports and compiler symbol references only; dynamic imports, CommonJS require, reflection, runtime registration and generated/ignored code can hide consumers. Absence is not proof of no consumer. An import does not require editing that consumer. Test reachability is not execution or assertion coverage.');
    return {component: 'A', query, snapshot: scope.hash, compiler: ts.version, config: configName, definitions: take(definitions.map(({symbol, ...d}) => d)),
      exports: take(publicExports), references: take(references), importers: take(edges.filter(e => targets.has(e.target))), chains: take(chains), entryPoints: take(entryPoints), tests: take(tests), checks: take(checks),
      unresolved: take(unresolved.filter(e => seen.has(e.file))), dynamic: take(dynamic.filter(e => seen.has(e.file))), limits: [...new Set(limits)],
      expansion: 'Read a related source file to explore that branch, or grep a literal symbol name. Each result has its own current snapshot.',
      cost: {elapsedMs: performance.now() - started, indexedFiles: parsed.size, reparsedFiles: reparsed, sourceBytes: scope.bytes}};
  };
}
