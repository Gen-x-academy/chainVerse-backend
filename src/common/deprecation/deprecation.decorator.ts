import { SetMetadata } from '@nestjs/common';

export const DEPRECATION_METADATA_KEY = 'deprecation';

export interface DeprecationOptions {
  sunset?: string;
  successorUrl?: string;
  documentationUrl?: string;
}

export const Deprecated = (options: DeprecationOptions = {}) =>
  SetMetadata(DEPRECATION_METADATA_KEY, options);
