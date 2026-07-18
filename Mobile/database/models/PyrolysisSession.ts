import { Model } from "@nozbe/watermelondb";
import { children } from "@nozbe/watermelondb/decorators";
import { field, text } from "@nozbe/watermelondb/decorators";
import type PyrolysisBatch from "./PyrolysisBatch";

export default class PyrolysisSession extends Model {
  static table = "pyrolysis_sessions";
  static associations = {
    pyrolysis_batches: { type: "has_many" as const, foreignKey: "session_id" },
  };

  @text("server_id") serverId!: string | null;
  @text("operator_id") operatorId!: string;
  @text("status") status!: string;
  @text("current_step") currentStep!: string;
  @text("sync_status") uploadStatus!: string;
  @text("sync_error") syncError!: string | null;
  @field("created_at") createdAt!: number;
  @field("updated_at") updatedAt!: number;

  @children("pyrolysis_batches") batches!: PyrolysisBatch[];
}
