
export function find_contact_by_email(
  contacts: SendAsAliasWire[],
  email: string,
): SendAsAliasWire | undefined {
  return contacts.find(c => c.send_as_email.toLowerCase() === email.toLowerCase());
}

export type AliasMatch = {
  match: SendAsAliasWire;
  is_domain_match: boolean;
} | null;

export const findBestAliasMatch = (contacts: SendAsAliasWire[], toEmails: string[], ccEmails: string[]): AliasMatch => {
  let match = contacts.find(a => toEmails.includes(a.send_as_email.toLowerCase()));
  if (!match) match = contacts.find(a => ccEmails.includes(a.send_as_email.toLowerCase()));
  if (match) return { match, is_domain_match: false };

  const aliasDomains = contacts.map(a => ({
    alias: a,
    domain: a.send_as_email.split("@")[1]?.toLowerCase(),
  }));
  const toDomains = toEmails.map(e => e.split("@")[1]).filter(Boolean);
  const ccDomains = ccEmails.map(e => e.split("@")[1]).filter(Boolean);

  const domainHit = aliasDomains.find(
    ad => ad.domain && toDomains.includes(ad.domain),
  ) ?? aliasDomains.find(
    ad => ad.domain && ccDomains.includes(ad.domain),
  );

  if (domainHit) return { match: domainHit.alias, is_domain_match: true };
  return null;
}
