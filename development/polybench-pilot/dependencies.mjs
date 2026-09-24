// Environment preparation only: standard Git post-checkout hook copies the same
// prepared dependency directories into every newly created author worktree.
// Source workspaces are resolved against that worktree, never the parent tree.
export function prepareWorktreeDependencies(session,directories){
 if(!Array.isArray(directories)||!directories.length||directories.some(p=>typeof p!=='string'||p.startsWith('/')||p.split('/').includes('..')||(p.split('/').at(-1)!=='node_modules'&&p!=='.build/electron'&&p!=='vendor/modules')))throw Error('Invalid dependency directories');
 const script=`const fs=require('fs'),path=require('path');const root=process.cwd();if(!root.startsWith('/work/repo/'))throw Error('Worktree outside prepared project');for(const relative of ${JSON.stringify(directories)}){const source=path.join('/input',relative),target=path.join(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(source,target,{recursive:true,verbatimSymlinks:true});}`;
 const hook='#!/bin/sh\nexec /diagnostic/node /work/config/copy-project-dependencies.cjs\n';
 const result=session.exec(['node','-e',`const fs=require('fs');fs.writeFileSync('/work/config/copy-project-dependencies.cjs',${JSON.stringify(script)});fs.writeFileSync('/work/repo/.git/hooks/post-checkout',${JSON.stringify(hook)},{mode:0o755});`]);
 if(result.status!==0)throw Error('Cannot prepare dependencies for delivery worktrees: '+result.stderr);
}
