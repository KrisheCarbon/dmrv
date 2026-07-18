import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

export default class EncryptedBatch extends Model {
  static table = 'encrypted_batches';

  @text('kiln_id') kilnId!: string;
  @text('kontikki_id') kontikkiId!: string;
  @text('payload_base64') payloadBase64!: string;
  @text('source_filename') sourceFilename!: string;
  @field('is_synced') isSynced!: boolean;
  @readonly @date('created_at') createdAt!: Date;
}
