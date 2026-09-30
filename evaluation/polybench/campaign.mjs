import fs from 'node:fs';
import path from 'node:path';
export const configPath=process.env.POLYBENCH_CAMPAIGN?path.resolve(process.env.POLYBENCH_CAMPAIGN):null;
export const campaign=configPath?JSON.parse(fs.readFileSync(configPath)):null;
export const local=path.resolve(campaign?.local_directory??'local/polybench');
if(campaign&&(!local.startsWith(path.resolve('local')+path.sep)||local===path.resolve('local/polybench')))throw Error('New campaigns require a distinct private local directory');
export const selectionPath=configPath?path.join(path.dirname(configPath),'selection.json'):path.resolve('evaluation/polybench/selection.json');
export const arms=campaign?.arms??['P','H0','H1'];
