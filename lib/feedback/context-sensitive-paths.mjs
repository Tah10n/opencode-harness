const SENSITIVE_DIRECTORY_NAMES = new Set([
  ".ssh", ".gnupg", ".aws", ".azure", ".kube", "secret", "secrets", "credential",
  "credentials", "private-key", "private-keys", "private_key", "private_keys",
]);

const SENSITIVE_FILE_NAMES = new Set([
  ".env", ".git-credentials", ".netrc", ".npmrc", ".pypirc", "auth.json", "credentials",
  "credentials.ini", "credentials.json", "credentials.toml", "credentials.yaml", "credentials.yml",
  "gradle.properties", "id_dsa", "id_ecdsa", "id_ed25519", "id_rsa", "local.properties",
  "nuget.config", "pip.conf", "secrets.json", "secrets.toml", "secrets.yaml", "secrets.yml",
  "settings-security.xml", "settings.xml",
]);

const SENSITIVE_EXTENSIONS = new Set([
  ".key", ".keystore", ".jks", ".p8", ".p12", ".pem", ".pfx", ".kdbx",
]);

export function isSensitiveContextPathSegments(value) {
  if (!Array.isArray(value) || value.length === 0
    || value.some((entry) => typeof entry !== "string" || entry.length === 0)) return true;
  const segments = value.map((entry) => entry.toLowerCase());
  const filename = segments.at(-1);
  const extension = filename.includes(".") ? `.${filename.split(".").at(-1)}` : "";
  return segments.slice(0, -1).includes(".env.example")
    || segments.some((segment) => SENSITIVE_DIRECTORY_NAMES.has(segment))
    || SENSITIVE_FILE_NAMES.has(filename)
    || (filename.startsWith(".env.") && filename !== ".env.example")
    || /^credentials\.(?:cfg|conf|ini|json|toml|txt|ya?ml)$/u.test(filename)
    || /^secrets?\.(?:cfg|conf|ini|json|toml|txt|ya?ml)$/u.test(filename)
    || /(^|[-_.])private[-_.]?key($|[-_.])/u.test(filename)
    || /(^|[-_.])service[-_.]?account($|[-_.])/u.test(filename)
    || SENSITIVE_EXTENSIONS.has(extension);
}
