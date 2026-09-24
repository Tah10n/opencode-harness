import {configure} from './index.mjs';export const render=(value,option)=>JSON.stringify(value,null,configure(option).indent);
