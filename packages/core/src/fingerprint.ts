import { sha256 } from './hash.js';
import {
  DEFAULT_NORMALIZATION_RULES,
  defaultRequestNormalizer,
  type NormalizationRules,
  type NormalizedRequest,
  type RawRequestForFingerprint,
  type RequestNormalizer,
} from './normalization.js';

export const fingerprintNormalizedRequest = (
  request: Pick<NormalizedRequest, 'method' | 'url' | 'body'>,
): string => sha256(`${request.method}\n${request.url}\n${request.body}`);

export const fingerprintRequest = (
  request: RawRequestForFingerprint,
  rules: NormalizationRules = DEFAULT_NORMALIZATION_RULES,
  normalizer: RequestNormalizer = defaultRequestNormalizer,
): { readonly fingerprint: string; readonly normalized: NormalizedRequest } => {
  const normalized = normalizer.normalize(request, rules);
  return {
    fingerprint: fingerprintNormalizedRequest(normalized),
    normalized,
  };
};
