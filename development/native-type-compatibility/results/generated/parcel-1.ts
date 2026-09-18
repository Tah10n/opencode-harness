import { default as API1 } from './index';
declare const subject1: API1<{ sample: [string] }>;
const returned = subject1["lookup"](1);
const callable = returned["action"];
callable("sample");
