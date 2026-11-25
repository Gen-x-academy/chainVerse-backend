/** Static, versioned safety content served by the safety center. */
export const CONDUCT_RULES_VERSION = '2026-01';

export const CONDUCT_RULES: readonly string[] = [
  'Be respectful: no harassment, discrimination or threats.',
  'Keep sessions professional; no sexual or romantic advances.',
  'Never ask for or share passwords, private keys or recovery phrases.',
  'Keep payments inside the platform escrow.',
  'Do not record or share a session without everyone’s consent.',
];

export const EMERGENCY_GUIDANCE = {
  immediate: 'If you or someone else is in immediate danger, contact your local emergency number first.',
  steps: [
    'Leave the session or conversation.',
    'Contact local emergency services if anyone is at risk.',
    'Tell a trusted contact where you are.',
    'File a report here so the safety team can follow up.',
  ],
  disclaimer: 'This platform is not an emergency service and cannot dispatch help.',
} as const;
