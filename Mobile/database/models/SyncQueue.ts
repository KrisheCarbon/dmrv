import { Model } from "@nozbe/watermelondb";
import { field, text } from "@nozbe/watermelondb/decorators";

export default class SyncQueue extends Model {
  static table = "sync_queue";

  @text("entity_type") entityType!: string;
  @text("entity_local_id") entityLocalId!: string;
  @text("operation") operation!: string;
  @text("status") status!: string;
  @field("retries") retries!: number;
  @text("error_message") errorMessage!: string | null;
  @field("created_at") createdAt!: number;
}
