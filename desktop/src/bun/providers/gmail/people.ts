import { gmail_fetch } from "./utils";
import { logger } from "../../utils/logger";
import { error_message } from "../../../shared/errors";

type PeopleSearchResponse = {
  results?: { person?: { photos?: { url: string }[] } }[];
};

const email_ref = (email: string): string => Bun.hash(email).toString(36).slice(0, 8);

const SEARCH_CONTACTS_URL = "https://people.googleapis.com/v1/people:searchContacts";

export async function search_contact_photo(access_token: string, email: string): Promise<string | null> {
  try {
    const res = await gmail_fetch(
      `${SEARCH_CONTACTS_URL}?query=${encodeURIComponent(email)}&pageSize=1&readMask=photos`,
      access_token,
    );
    const data: PeopleSearchResponse = await res.json();
    if (data.results?.[0]?.person?.photos?.[0]?.url) {
      return data.results[0].person.photos[0].url;
    }
  } catch (err) {
    logger.warn("people", `searchContacts photo fetch failed: contact=${email_ref(email)} err=${error_message(err)}`);
  }

  return null;
}

export async function batch_fetch_contact_photos(access_token: string, emails: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const concurrency = 5;

  for (let i = 0; i < emails.length; i += concurrency) {
    const batch = emails.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((email) => search_contact_photo(access_token, email)),
    );
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled" && r.value) {
        map.set(batch[j], r.value);
      }
    }
  }

  return map;
}
