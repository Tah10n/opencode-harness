import { EventEmitter as API5 } from './index';
declare const subject5: API5<{ sample: [string] }, { marker: string }>;
const returned = subject5["listeners"]("sample");
const callable = returned[0];
callable("sample");
