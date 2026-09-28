import { safeGet, safeSet } from "./helpers";
import { ROLE_PASSWORDS as DEFAULT_ROLE_PASSWORDS } from "./defaultPasswords";

// Local (per-device) cached copy — always available instantly, even before
// any Firestore fetch resolves.
export function getRolePasswords() {
  return safeGet("mm-role-passwords") || DEFAULT_ROLE_PASSWORDS;
}

export function cacheRolePasswords(next) {
  safeSet("mm-role-passwords", next);
}
