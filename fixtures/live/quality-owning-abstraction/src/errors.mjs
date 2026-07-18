export class ValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
  }
}

export function errorPayload(error) {
  return { code: error.code, message: error.message };
}
