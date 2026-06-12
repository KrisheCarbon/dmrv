import { Model } from "@nozbe/watermelondb";
import { field, text } from "@nozbe/watermelondb/decorators";

export default class SyncQueue extends Model {
  static table = "sync_queue";

  @text("entity_type") entityType;
  @text("entity_local_id") entityLocalId;
  @text("operation") operation;
  @text("status") status;
  @field("retries") retries;
  @text("error_message") errorMessage;
  @field("created_at") createdAt;
}
