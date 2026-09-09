# conditional-form-errors

Rules execute in order with strict conditional equality. Only undefined/null/empty string are missing; false and zero are present. Required takes precedence over minLength. Summary links keep the first error for each path and encode each segment separately before slash joining; inputs are preserved.
