export function isRetryable(status){return [408, 425, 429, 500, 502, 503, 504].includes(status);}
