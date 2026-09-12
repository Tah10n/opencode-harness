# Verified stateful scenarios

Review and complete the project regression coverage for the existing single-job worker. The suite must meaningfully exercise successful delivery, failed delivery and retry, and idle processing through work(q, send). A successful job is sent once and removed; a failed job retains its ID and payload and is returned to ready with no lease left, while unrelated ready work is preserved. A later successful attempt can consume the retried job. An empty queue returns empty result arrays and must not call send. Preserve these independent scenarios and all existing public exports and valid behavior. Repair any coverage or implementation problem needed to satisfy this contract; correct behavior may remain unchanged. Use Node built-ins, no dependencies or production API solely for tests. Deliver the complete patch with meaningful project tests and an accurate README describing these scenarios. Run npm test after the last edit.

Run `npm test`.
