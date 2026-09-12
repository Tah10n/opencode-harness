# mime-inline-attachments

Parts follow first cid reference order and appear once; unused attachments are omitted but validated. Only a byte view’s visible range is encoded. Identical duplicate attachments are accepted, conflicts/missing references and CR/LF types throw TypeError. HTML is scanned literally, not parsed.
