import { EventEmitter as API4 } from './index';
declare const subject4: API4<{ sample: [string] }, { sample: [string] }>;
const returned = subject4["listeners"]("sample");
const callable = returned[0];
callable("sample");
