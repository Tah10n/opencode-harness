import { formatProfile } from "./profile.mjs";

export function handleProfile(record, config = {}) {
  return formatProfile(record, { legacy: config.legacy_profile === true });
}
