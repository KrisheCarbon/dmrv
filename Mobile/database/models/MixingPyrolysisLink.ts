import { Model } from "@nozbe/watermelondb";
import { relation, text } from "@nozbe/watermelondb/decorators";
import type MixingEntry from "./MixingEntry";

export default class MixingPyrolysisLink extends Model {
  static table = "mixing_pyrolysis_links";
  static associations = {
    mixing_entries: { type: "belongs_to" as const, key: "mixing_entry_id" },
  };

  @text("mixing_entry_id") mixingEntryId!: string;
  @text("pyrolysis_batch_server_id") pyrolysisBatchServerId!: string;
  @text("pyrolysis_batch_local_id") pyrolysisBatchLocalId!: string | null;
  @text("kontikki_code") kontikkiCode!: string | null;
  @text("batch_number") batchNumber!: string | null;
  @text("producer_name") producerName!: string | null;

  @relation("mixing_entries", "mixing_entry_id") mixingEntry!: MixingEntry;
}
