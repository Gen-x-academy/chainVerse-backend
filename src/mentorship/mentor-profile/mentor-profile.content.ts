import {
  MentorProfileContent,
  MentorProfileVisibility,
} from './schemas/mentor-profile.schema';
import { UpsertMentorProfileDto } from './dto/upsert-mentor-profile.dto';

/** Plain, fully populated profile body. Key order is fixed so JSON comparison is stable. */
export interface MentorProfileBody {
  headline: string;
  bio: string;
  expertise: string[];
  languages: string[];
  timeZone: string;
  yearsOfExperience: number;
  teachingApproach: string;
  deliveryMode: string;
  hourlyRate: number;
  rating: number;
  links: Array<{ label: string; url: string }>;
  visibility: MentorProfileVisibility;
}

/** Trims, drops empties and removes case-insensitive duplicates, keeping the first spelling. */
function cleanList(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values ?? []) {
    const value = raw.trim();
    const key = value.toLowerCase();
    if (value && !seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}

/**
 * Turns a request body into the canonical stored shape. Saving is a full replace:
 * a field the caller leaves out returns to its default, so the same body always
 * produces the same profile.
 */
export function normalizeContent(dto: UpsertMentorProfileDto): MentorProfileBody {
  return {
    headline: (dto.headline ?? '').trim(),
    bio: (dto.bio ?? '').trim(),
    expertise: cleanList(dto.expertise),
    languages: cleanList(dto.languages),
    timeZone: (dto.timeZone ?? '').trim(),
    yearsOfExperience: dto.yearsOfExperience ?? 0,
    teachingApproach: (dto.teachingApproach ?? '').trim(),
    deliveryMode: (dto.deliveryMode ?? 'online').trim().toLowerCase(),
    hourlyRate: dto.hourlyRate ?? 0,
    rating: 0,
    links: (dto.links ?? []).map((link) => ({
      label: link.label.trim(),
      url: link.url.trim(),
    })),
    visibility: dto.visibility ?? MentorProfileVisibility.PUBLIC,
  };
}

/** Copies a stored body into plain data, picking fields explicitly. */
export function toBody(content: MentorProfileContent): MentorProfileBody {
  return {
    headline: content.headline ?? '',
    bio: content.bio ?? '',
    expertise: [...(content.expertise ?? [])],
    languages: [...(content.languages ?? [])],
    timeZone: content.timeZone ?? '',
    yearsOfExperience: content.yearsOfExperience ?? 0,
    teachingApproach: content.teachingApproach ?? '',
    deliveryMode: content.deliveryMode ?? 'online',
    hourlyRate: content.hourlyRate ?? 0,
    rating: content.rating ?? 0,
    links: (content.links ?? []).map((l) => ({ label: l.label, url: l.url })),
    visibility: content.visibility ?? MentorProfileVisibility.PUBLIC,
  };
}

export function contentEquals(
  a: MentorProfileContent | MentorProfileBody,
  b: MentorProfileContent | MentorProfileBody,
): boolean {
  return JSON.stringify(toBody(a as MentorProfileContent)) === JSON.stringify(toBody(b as MentorProfileContent));
}

/** Fields that must be filled before a profile can be published. */
export function missingForPublish(content: MentorProfileContent | MentorProfileBody): string[] {
  const body = toBody(content as MentorProfileContent);
  const missing: string[] = [];
  if (!body.headline) missing.push('headline');
  if (!body.bio) missing.push('bio');
  if (body.expertise.length === 0) missing.push('expertise');
  if (body.languages.length === 0) missing.push('languages');
  if (!body.timeZone) missing.push('timeZone');
  return missing;
}

/** True when `timeZone` is a name the runtime's time zone database knows. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** What a viewer other than the owner may see. No owner id, no visibility setting. */
export type PublicMentorProfileView = Omit<MentorProfileBody, 'visibility'> & {
  id: string;
};

export function toPublicView(id: string, content: MentorProfileContent): PublicMentorProfileView {
  const { visibility: _visibility, ...rest } = toBody(content);
  return { id, ...rest };
}
