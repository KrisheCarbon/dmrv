import { Model } from "@nozbe/watermelondb";
import { children } from "@nozbe/watermelondb/decorators";
import { field, text } from "@nozbe/watermelondb/decorators";
import type MixingPyrolysisLink from "./MixingPyrolysisLink";

export default class MixingEntry extends Model {
  static table = "mixing_entries";
  static associations = {
    mixing_pyrolysis_links: {
      type: "has_many" as const,
      foreignKey: "mixing_entry_id",
    },
  };

  @text("server_id") serverId!: string | null;
  @text("operator_id") operatorId!: string;
  @text("started_at") startedAt!: string;
  @text("status") status!: string;
  @text("farm_id") farmId!: string | null;
  @text("farm_name") farmName!: string | null;
  @field("location_lat") locationLat!: number | null;
  @field("location_lng") locationLng!: number | null;
  @text("location_address") locationAddress!: string | null;
  @text("material_type") materialType!: string | null;
  @field("material_to_biochar_ratio") materialToBiocharRatio!: number | null;
  @text("comment") comment!: string | null;
  @text("biochar_photo_local_uri") biocharPhotoLocalUri!: string | null;
  @text("biochar_photo_url") biocharPhotoUrl!: string | null;
  @text("biochar_photo_metadata_json") biocharPhotoMetadataJson!: string | null;
  @text("substrate_photo_local_uri") substratePhotoLocalUri!: string | null;
  @text("substrate_photo_url") substratePhotoUrl!: string | null;
  @text("substrate_photo_metadata_json") substratePhotoMetadataJson!: string | null;
  @text("mixing_photo_local_uri") mixingPhotoLocalUri!: string | null;
  @text("mixing_photo_url") mixingPhotoUrl!: string | null;
  @text("mixing_photo_metadata_json") mixingPhotoMetadataJson!: string | null;
  @text("sync_status") uploadStatus!: string;
  @text("sync_error") syncError!: string | null;
  @field("created_at") createdAt!: number;
  @field("updated_at") updatedAt!: number;

  @children("mixing_pyrolysis_links") pyrolysisLinks!: MixingPyrolysisLink[];
}
