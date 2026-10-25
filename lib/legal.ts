/**
 * Who runs the service, as shown on the Terms and Privacy pages. Set these in the host's variables once the
 * business name is settled. Until then the pages fall back to the product name, so no placeholder text shows.
 */
export function legalParty() {
  const name = (process.env.LEGAL_NAME || "").trim();
  const address = (process.env.LEGAL_ADDRESS || "").trim();
  const city = (process.env.LEGAL_COURT_CITY || "").trim();
  return {
    name: name || "Zignal Connect",
    address,
    named: Boolean(name),
    courts: city ? `the courts at ${city}` : "the courts in India that have jurisdiction",
  };
}

export const LEGAL_UPDATED = "24 October 2026";
export const GRIEVANCE_EMAIL = "support@zignalconnect.com";
