import ts from 'typescript';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {materializeNativeTemplate} from '../lib/native-template.mjs';
const root=process.cwd();
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.name==='node_modules'||e.name==='__pycache__'||e.name.includes('.local.')?[]:e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
for(const dir of ['lib','scripts','evaluation'])for(const file of walk(dir).filter(f=>f.endsWith('.mjs'))){
 const code=fs.readFileSync(file,'utf8');
 const source=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const visit=node=>{
  const spec=(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))?node.moduleSpecifier:(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword?node.arguments[0]:null);
  if(spec&&ts.isStringLiteral(spec)&&spec.text.startsWith('.'))assert.ok(fs.existsSync(path.resolve(path.dirname(file),spec.text)),`${file}: missing ${spec.text}`);
  ts.forEachChild(node,visit);
 };visit(source);
 if(file.startsWith('lib/'))assert.ok(!code.includes('development/')&&!code.includes('local/'),'Runtime depends on historical campaign: '+file);
}
const p=JSON.parse(fs.readFileSync('package.json'));
for(const file of Object.values(p.exports))assert.ok(fs.existsSync(file),'Missing export '+file);
for(const command of Object.values(p.scripts))for(const match of command.matchAll(/(?:node|python3)\s+([^\s]+\.(?:mjs|py))/g))assert.ok(fs.existsSync(match[1]),'Missing script '+match[1]);
for(const file of ['README.md',...walk('docs').filter(f=>f.endsWith('.md'))]){
 const text=fs.readFileSync(file,'utf8');assert.ok(!text.includes('/Users/'),file+' has private absolute path');
 for(const m of text.matchAll(/\]\(([^)]+)\)/g)){if(/^(?:https?:|#)/.test(m[1]))continue;const target=m[1].split('#')[0];assert.ok(fs.existsSync(path.resolve(path.dirname(file),target)),file+' broken link '+target);}
}
const bundle=materializeNativeTemplate({repositoryRoot:root,outputDirectory:path.join(root,'local/boundary-unused'),dryRun:true,task:true,review:true});
assert.ok(bundle.files.includes('native-task-plugin.mjs'));assert.ok(bundle.files.every(f=>!f.includes('development')&&!f.includes('quality')));
console.log('Native bundle, imports, exports, scripts and local documentation links verified');
