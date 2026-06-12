import { appSchema, tableSchema } from "@nozbe/watermelondb";

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: "farmers",
      columns: [
        { name: "server_id", type: "string", isOptional: true },
        { name: "farmer_name", type: "string" },
        { name: "mobile_number", type: "string" },
        { name: "latitude", type: "number" },
        { name: "longitude", type: "number" },
        { name: "address", type: "string" },
        { name: "total_land_size", type: "number" },
        { name: "crops", type: "string" },
        { name: "interested_in_biochar", type: "boolean" },
        { name: "prior_biochar_exp", type: "boolean" },
        { name: "prior_biochar_acreage", type: "number", isOptional: true },
        { name: "consent_document_url", type: "string", isOptional: true },
        { name: "consent_local_uri", type: "string", isOptional: true },
        { name: "estimated_biomass", type: "number" },
        { name: "created_by", type: "string" },
        { name: "assigned_to", type: "string" },
        { name: "sync_status", type: "string" },
        { name: "sync_error", type: "string", isOptional: true },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" }
      ]
    }),
    tableSchema({
      name: "sync_queue",
      columns: [
        { name: "entity_type", type: "string" },
        { name: "entity_local_id", type: "string" },
        { name: "operation", type: "string" },
        { name: "status", type: "string" },
        { name: "retries", type: "number" },
        { name: "error_message", type: "string", isOptional: true },
        { name: "created_at", type: "number" }
      ]
    })
  ]
});
