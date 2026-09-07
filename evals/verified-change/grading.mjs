import fs from 'node:fs';import path from 'node:path';import {hash} from './inputs.mjs';
export function prepareGrader(directory,hidden){const grader=path.join(directory,'grader'),file=path.join(grader,'hidden.test.mjs');fs.mkdirSync(grader,{recursive:true,mode:0o700});if(!fs.existsSync(file))fs.writeFileSync(file,hidden,{flag:'wx',mode:0o600});if(fs.lstatSync(file).isSymbolicLink()||hash(fs.readFileSync(file))!==hash(hidden))throw Error('GRADER_BYTES_CHANGED');return grader;}
// Product repair classification stays conservative. The final evaluator also
// recognizes Node's source parse/link failures against these validated, frozen
// test imports. Preserve the original product status and diagnostics alongside
// this interpretation; never reinterpret arbitrary prose as an assertion.
export function classifyCheck(check){
 if(['passed','assertion_failed'].includes(check.status))return {available:true,success:check.status==='passed',reason:check.status};
 if(check.status!=='infrastructure_error'||check.truncated||check.testOutputTruncated||check.exitCode!==1)return {available:false,success:false,reason:check.status};
 const stderr=check.testStderr??'';
 const sourceSyntax=/(?:^|\n)(?:file:\/\/)?\/workspace\/src\/[^\n]+:\d+\n[^]*?\nSyntaxError:/.test(stderr);
 const missingExport=/SyntaxError: The requested module ['"](?:\.\.\/src\/|\/workspace\/src\/)[^'"\n]+['"] does not provide an export named ['"][^'"\n]+['"]/.test(stderr);
 if(sourceSyntax||missingExport)return {available:true,success:false,reason:'candidate_source_parse_or_link_failure'};
 const sourceFailures=check.assertions?.length&&check.assertions.every(f=>{const firstFrame=(f.stack??'').split('\n').find(line=>/^\s+at /.test(line))??'';return f.code==='ERR_ASSERTION'||(f.failureType==='testCodeFailure'&&/\bat [^\n]*\(?file:\/\/\/workspace\/src\/[^\n]+:\d+:\d+/.test(firstFrame));});
 if(sourceFailures)return {available:true,success:false,reason:'candidate_source_runtime_failure'};
 return {available:false,success:false,reason:'grading_infrastructure_unresolved'};
}
