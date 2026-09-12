# record-projection-consumer

Project only requested own paths into flat renamed keys; missing paths are omitted, explicit null and other falsy values stay present. Inputs are plain acyclic JSON data without custom methods or undefined. Nested results are deep copies independent of source and other rows; special output names are own data properties.
