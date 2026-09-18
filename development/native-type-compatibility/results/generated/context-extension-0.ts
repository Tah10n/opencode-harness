import { EventEmitter as API3 } from './index';
declare const subject3: API3<{ sample: [string] }, string>;
const returned = subject3["listeners"]("sample");
const callable = returned[0];
callable("sample");
