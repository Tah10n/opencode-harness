// Manual positive control: this receiver was required by the old declaration.
import Cabinet from './index';
declare const cabinet: Cabinet;
const action = cabinet.take()[0];
action.call({ marker: 'ok' }, 1);
