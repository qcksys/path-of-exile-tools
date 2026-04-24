/**
 * Build a User-Agent header string in the format required by the GGG API.
 *
 * The Path of Exile Developer API rejects requests whose User-Agent does not
 * follow the shape:
 *
 *     OAuth {clientId}/{version} (contact: {contact}) {extra?}
 *
 * Applications that ignore this rule risk access revocation.
 *
 * @see https://www.pathofexile.com/developer/docs/index
 */
export interface UserAgentParts {
  /** OAuth `client_id` registered with GGG. */
  clientId: string;
  /** Semver-ish version of your application. */
  version: string;
  /** Contact email or URL GGG can reach you at. */
  contact: string;
  /** Optional trailing token (e.g. build SHA, platform). */
  extra?: string;
}

export function buildUserAgent(parts: UserAgentParts): string {
  const { clientId, version, contact, extra } = parts;
  return `OAuth ${clientId}/${version} (contact: ${contact})${extra ? ` ${extra}` : ""}`;
}
