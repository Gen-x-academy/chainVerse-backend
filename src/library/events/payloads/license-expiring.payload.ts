/** Payload emitted when a digital content licence is about to expire. */
export class LicenseExpiringPayload {
  licenseId: string;
  patronId: string;
  itemId: string;
  expiresAt: string;
}