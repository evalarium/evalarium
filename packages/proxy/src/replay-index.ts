import {
  REPLAY_MATCH_KIND,
  fingerprintRequest,
  graphqlIgnoredVariableValues,
  graphqlOperationNames,
  type NormalizationRules,
  type NormalizedRequest,
  type RawRequestForFingerprint,
  type RecordedRequest,
  type ReplayMatchKind,
} from '@evalarium/core';

import { levenshteinDistance } from './levenshtein.js';

export interface ReplayResolution {
  readonly fingerprint: string;
  readonly normalized: NormalizedRequest;
  readonly graphqlOperation: string | null;
  readonly matchKind: ReplayMatchKind;
  readonly request: RecordedRequest | null;
  readonly distance: number | null;
}

const headerIncludes = (
  headers: Readonly<Record<string, string | readonly string[]>>,
  headerName: string,
  needle: string,
): boolean => {
  const matching = Object.keys(headers).find(
    (name) => name.toLowerCase() === headerName,
  );
  if (matching === undefined) {
    return false;
  }
  const value = headers[matching];
  const joined = typeof value === 'string' ? value : (value?.join(',') ?? '');
  return joined.toLowerCase().includes(needle);
};

const wantsHtmlDocument = (request: RawRequestForFingerprint): boolean =>
  headerIncludes(request.headers, 'accept', 'text/html');

const respondsWithHtml = (candidate: RecordedRequest): boolean =>
  headerIncludes(candidate.responseHeaders, 'content-type', 'text/html');

const candidateDistance = (
  normalizedUrl: string,
  graphqlOperation: string | null,
  candidate: RecordedRequest,
): number => {
  const urlDistance = levenshteinDistance(
    normalizedUrl,
    candidate.normalizedUrl,
  );
  if (graphqlOperation === null && candidate.graphqlOperation === null) {
    return urlDistance;
  }
  return (
    urlDistance +
    levenshteinDistance(
      graphqlOperation ?? '',
      candidate.graphqlOperation ?? '',
    )
  );
};

export type RequestBodyLookup = (bodyHash: string) => Uint8Array | undefined;

export class ReplayIndex {
  readonly #requests: readonly RecordedRequest[];
  readonly #rules: NormalizationRules;
  readonly #byFingerprint = new Map<string, readonly RecordedRequest[]>();
  readonly #cursors = new Map<string, number>();
  readonly #requestBodyLookup: RequestBodyLookup | null;
  // Client-generated record ids observed at replay, mapped to the ids the
  // recording used for the same creates. Substituting them keeps follow-up
  // requests about created records on the recorded trail.
  readonly #idAliases = new Map<string, string>();

  constructor(
    requests: readonly RecordedRequest[],
    rules: NormalizationRules,
    requestBodyLookup: RequestBodyLookup | null = null,
  ) {
    this.#requests = [...requests].sort(
      (left, right) =>
        left.sequence - right.sequence || left.id.localeCompare(right.id),
    );
    this.#rules = rules;
    this.#requestBodyLookup = requestBodyLookup;
    for (const request of this.#requests) {
      const existing = this.#byFingerprint.get(request.fingerprint) ?? [];
      this.#byFingerprint.set(request.fingerprint, [...existing, request]);
    }
  }

  reset(): void {
    this.#cursors.clear();
    this.#idAliases.clear();
  }

  // Requests recorded during the prepare phase (login, seeding navigation)
  // are context: when a fingerprint also has replay-phase instances, replay
  // starts at the first of those.
  #initialCursor(candidates: readonly RecordedRequest[]): number {
    const firstReplay = candidates.findIndex(
      (candidate) => candidate.capturePhase !== 'prepare',
    );
    return firstReplay === -1 ? 0 : firstReplay;
  }

  #substituteAliases(
    request: RawRequestForFingerprint,
  ): RawRequestForFingerprint {
    if (this.#idAliases.size === 0) {
      return request;
    }
    let url = request.url;
    let body: string | undefined;
    if (typeof request.body === 'string') {
      body = request.body;
    } else if (request.body !== undefined) {
      body = new TextDecoder().decode(request.body);
    }
    let changed = false;
    for (const [replayId, recordedId] of this.#idAliases) {
      if (body !== undefined && body.includes(replayId)) {
        body = body.split(replayId).join(recordedId);
        changed = true;
      }
      if (url.includes(replayId)) {
        url = url.split(replayId).join(recordedId);
        changed = true;
      }
      const encoded = encodeURIComponent(replayId);
      if (url.includes(encoded)) {
        url = url.split(encoded).join(encodeURIComponent(recordedId));
        changed = true;
      }
    }
    if (!changed) {
      return request;
    }
    return {
      ...request,
      url,
      ...(body === undefined ? {} : { body }),
    };
  }

  #learnAliases(
    incoming: RawRequestForFingerprint,
    matched: RecordedRequest,
  ): void {
    if (
      this.#requestBodyLookup === null ||
      matched.requestBodyHash === null ||
      matched.graphqlOperation === null
    ) {
      return;
    }
    const recordedBody = this.#requestBodyLookup(matched.requestBodyHash);
    if (recordedBody === undefined) {
      return;
    }
    const incomingValues = graphqlIgnoredVariableValues(incoming, this.#rules);
    const recordedValues = graphqlIgnoredVariableValues(
      {
        method: matched.method,
        url: matched.url,
        headers: matched.requestHeaders,
        body: recordedBody,
      },
      this.#rules,
    );
    if (incomingValues === null || recordedValues === null) {
      return;
    }
    const pairCount = Math.min(incomingValues.length, recordedValues.length);
    for (let index = 0; index < pairCount; index += 1) {
      const replayValue = incomingValues[index];
      const recordedValue = recordedValues[index];
      if (
        replayValue !== undefined &&
        recordedValue !== undefined &&
        replayValue !== recordedValue &&
        !this.#idAliases.has(replayValue)
      ) {
        this.#idAliases.set(replayValue, recordedValue);
      }
    }
  }

  resolve(rawRequest: RawRequestForFingerprint): ReplayResolution {
    const request = this.#substituteAliases(rawRequest);
    const { fingerprint, normalized } = fingerprintRequest(
      request,
      this.#rules,
    );
    const graphqlOperation = graphqlOperationNames(request, this.#rules);
    const exactRequests = this.#byFingerprint.get(fingerprint);
    if (exactRequests !== undefined && exactRequests.length > 0) {
      const cursor =
        this.#cursors.get(fingerprint) ?? this.#initialCursor(exactRequests);
      const requestIndex = Math.min(cursor, exactRequests.length - 1);
      this.#cursors.set(fingerprint, cursor + 1);
      const matched = exactRequests[requestIndex] ?? null;
      if (matched !== null) {
        this.#learnAliases(request, matched);
      }
      return {
        fingerprint,
        normalized,
        graphqlOperation,
        matchKind: REPLAY_MATCH_KIND.EXACT,
        request: matched,
        distance: 0,
      };
    }

    const sameMethod = this.#requests.filter(
      (candidate) => candidate.method.toUpperCase() === normalized.method,
    );
    let candidates = sameMethod.length > 0 ? sameMethod : this.#requests;
    if (wantsHtmlDocument(request)) {
      const htmlCandidates = candidates.filter((candidate) =>
        respondsWithHtml(candidate),
      );
      if (htmlCandidates.length > 0) {
        candidates = htmlCandidates;
      }
    }
    const closest = candidates
      .map((candidate) => ({
        candidate,
        distance: candidateDistance(
          normalized.url,
          graphqlOperation,
          candidate,
        ),
      }))
      .sort(
        (left, right) =>
          left.distance - right.distance ||
          Number(left.candidate.capturePhase === 'prepare') -
            Number(right.candidate.capturePhase === 'prepare') ||
          left.candidate.sequence - right.candidate.sequence ||
          left.candidate.id.localeCompare(right.candidate.id),
      )[0];

    if (closest === undefined) {
      return {
        fingerprint,
        normalized,
        graphqlOperation,
        matchKind: REPLAY_MATCH_KIND.MISS,
        request: null,
        distance: null,
      };
    }
    return {
      fingerprint,
      normalized,
      graphqlOperation,
      matchKind: REPLAY_MATCH_KIND.FALLBACK,
      request: closest.candidate,
      distance: closest.distance,
    };
  }
}
