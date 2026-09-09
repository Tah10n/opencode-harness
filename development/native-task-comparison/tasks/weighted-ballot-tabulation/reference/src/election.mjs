import {tabulate} from './tabulate.mjs';import {renderReport} from './report.mjs';
export function runElection(candidates,ballots){const result=tabulate(candidates,ballots);return{...result,report:renderReport(result)};}
