import { ValidationError } from "./errors.mjs";

export function validateUser() {
  throw new ValidationError("INVALID_INPUT", "  invalid user input  ");
}
