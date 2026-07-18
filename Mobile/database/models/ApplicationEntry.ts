import { Model } from "@nozbe/watermelondb";
import { children } from "@nozbe/watermelondb/decorators";
import { field, text } from "@nozbe/watermelondb/decorators";
import type ApplicationPyrolysisLink from "./ApplicationPyrolysisLink";

export default class ApplicationEntry extends Model {
  static table = "application_entries";
  static associations = {
    application_pyrolysis_links: {
      type: "has_many" as const,
      foreignKey: "application_entry_id",
    },
  };

  @text("server_id") serverId!: string | null;
  @text("operator_id") operatorId!: string;
  @text("applied_at") appliedAt!: string;
  @text("status") status!: string;
  @text("farm_id") farmId!: string | null;
  @text("farm_name") farmName!: string | null;
  @text("comment") comment!: string | null;
  @text("media_type") mediaType!: string | null;
  @text("media_local_uri") mediaLocalUri!: string | null;
  @text("media_url") mediaUrl!: string | null;
  @text("media_metadata_json") mediaMetadataJson!: string | null;
  @text("sync_status") uploadStatus!: string;
  @text("sync_error") syncError!: string | null;
  @field("created_at") createdAt!: number;
  @field("updated_at") updatedAt!: number;

  @children("application_pyrolysis_links") pyrolysisLinks!: ApplicationPyrolysisLink[];
}
