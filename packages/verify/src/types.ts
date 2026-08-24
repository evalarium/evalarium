import type { Cookie, ReplayRequestLogEntry, TaskSpec } from '@evalarium/core';
import type { EnvironmentHandle } from '@evalarium/runtime';

export interface DomAssertions {
  text(selector: string): Promise<string>;
  isVisible(selector: string): Promise<boolean>;
  hasText(selector: string, expected: string): Promise<boolean>;
}

export interface NetworkRequestMatcher {
  readonly method?: string;
  readonly url?: string | RegExp;
  readonly graphqlOperation?: string;
  readonly matchKind?: ReplayRequestLogEntry['matchKind'];
  /** Matches when any operation's variables satisfy the predicate. */
  readonly variables?: (variables: unknown) => boolean;
}

export interface NetworkAssertions {
  requests(): readonly ReplayRequestLogEntry[];
  count(matcher: NetworkRequestMatcher): number;
  has(matcher: NetworkRequestMatcher): boolean;
}

export interface StorageReads {
  localStorage(name: string): Promise<string | null>;
  sessionStorage(name: string): Promise<string | null>;
  cookies(): Promise<readonly Cookie[]>;
}

export interface VerifyContext {
  readonly page: EnvironmentHandle['page'];
  readonly dom: DomAssertions;
  readonly network: NetworkAssertions;
  readonly storage: StorageReads;
}

export interface TaskDefinition extends TaskSpec {
  readonly kind: 'evalarium-task';
  readonly verify: (context: VerifyContext) => number | Promise<number>;
}

export interface TaskResult {
  readonly id: string;
  readonly reward: number;
  readonly passed: boolean;
}
