import { default as API0 } from './index';
declare const subject0: API0<string>;
const returned = subject0["lookup"](1);
const callable = returned["action"];
callable("sample");
