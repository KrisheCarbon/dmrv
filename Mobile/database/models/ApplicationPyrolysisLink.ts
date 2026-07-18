import { Model } from "@nozbe/watermelondb";
import { relation, text } from "@nozbe/watermelondb/decorators";
import type ApplicationEntry from "./ApplicationEntry";

export default class ApplicationPyrolysisLink extends Model {
  static table = "application_pyrolysis_links";
  static associations = {
    application_entries: { type: "belongs_to" as const, key: "application_entry_id" },
  };

  @text("application_entry_id") applicationEntryId!: string;
  @text("pyrolysis_batch_server_id") pyrolysisBatchServerId!: string;
  @text("pyrolysis_batch_local_id") pyrolysisBatchLocalId!: string | null;
  @text("kontikki_code") kontikkiCode!: string | null;
  @text("batch_number") batchNumber!: string | null;
  @text("producer_name") producerName!: string | null;

  @relation("application_entries", "application_entry_id") applicationEntry!: ApplicationEntry;
}
