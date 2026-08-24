import type { InputEvent } from './events.js';
import type { RecordedRequest, Session } from './recording.js';
import type { StorageSnapshot } from './storage.js';

export interface RecordingSink {
  writeSession(session: Session): Promise<void>;
  writeRequest(
    request: RecordedRequest,
    requestBody: Uint8Array,
    responseBody: Uint8Array,
  ): Promise<void>;
  writeEvent(event: InputEvent): Promise<void>;
  writeStorageSnapshot(snapshot: StorageSnapshot): Promise<void>;
  close(): Promise<void>;
}
