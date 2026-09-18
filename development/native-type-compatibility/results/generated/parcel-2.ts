import { default as API2 } from './index';
declare const subject2: API2<{ marker: string }>;
const returned = subject2["lookup"](1);
const callable = returned["action"];
callable("sample");
