# mime-inline-attachments

Integrate composeMail(html,attachments) with reusable attachment helpers. Produce a MIME-ready manifest {html,parts:[{cid,type,base64}]} where parts follow first reference order in HTML, duplicate references appear once, and unreferenced attachments are omitted. A reference is literal cid: followed by one or more ASCII letters/digits/underscore/dot/hyphen, anywhere in the opaque HTML string. inlineIds returns those ordered unique IDs. attachmentMap returns a Map from cid to {cid,type,base64}; bytes may be Uint8Array subviews and only their visible bytes are encoded. Duplicate attachment CIDs are allowed only if type and bytes are identical; conflicting duplicates, missing referenced CIDs, or any CR/LF in type throw TypeError. Validate every supplied attachment, including unused ones. Domain: valid nonempty CID identifiers, nonempty ASCII type strings except forbidden CR/LF, Uint8Array bytes. Preserve plain HTML without attachments and do not mutate caller data.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- First-reference ordering with duplicate references and a byte subview.
- Conflicting duplicate CID rejection.

Update project documentation to explain:
- Ordered unique referenced parts; unused attachments omitted but validated.
- Byte-view boundaries and duplicate/missing CID TypeError behavior.

Run npm test after the last source or test change.
