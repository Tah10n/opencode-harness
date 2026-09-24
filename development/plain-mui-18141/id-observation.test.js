// Independent diagnostic from the literal issue requirement; not official test_patch.
import React from 'react';
import { expect } from 'chai';
import { createClientRender } from 'test/utils/createClientRender';
import TextField from './TextField';

describe('literal native select ID diagnostic', () => {
  const render = createClientRender({ strict: true });
  it('preserves supplied id and label htmlFor on the actual select', () => {
    const { container, getByLabelText } = render(
      <TextField select id="labelled-select" label="Currency:" SelectProps={{ native: true }}>
        <option value="dollar">$</option>
      </TextField>,
    );
    const select = container.querySelector('select');
    const label = container.querySelector('label');
    console.log('LITERAL_ID_OBSERVATION ' + JSON.stringify({
      suppliedId: 'labelled-select', selectId: select.id, labelHtmlFor: label.htmlFor,
    }));
    expect(select.id).to.equal('labelled-select');
    expect(label.htmlFor).to.equal(select.id);
    expect(getByLabelText('Currency:')).to.equal(select);
  });
});
