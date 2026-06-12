import { Model } from "@nozbe/watermelondb";
import { field, text, json } from "@nozbe/watermelondb/decorators";

export default class Farmer extends Model {
  static table = "farmers";

  @text("server_id") serverId;
  @text("farmer_name") farmerName;
  @text("mobile_number") mobileNumber;
  @field("latitude") latitude;
  @field("longitude") longitude;
  @text("address") address;
  @field("total_land_size") totalLandSize;
  @json("crops", (raw) => (Array.isArray(raw) ? raw : [])) crops;
  @field("interested_in_biochar") interestedInBiochar;
  @field("prior_biochar_exp") priorBiocharExp;
  @field("prior_biochar_acreage") priorBiocharAcreage;
  @text("consent_document_url") consentDocumentUrl;
  @text("consent_local_uri") consentLocalUri;
  @field("estimated_biomass") estimatedBiomass;
  @text("created_by") createdBy;
  @text("assigned_to") assignedTo;
  @text("sync_status") syncStatus;
  @text("sync_error") syncError;
  @field("created_at") createdAt;
  @field("updated_at") updatedAt;

  toFormData() {
    return {
      id: this.id,
      server_id: this.serverId,
      farmer_name: this.farmerName,
      mobile_number: this.mobileNumber,
      latitude: this.latitude,
      longitude: this.longitude,
      address: this.address,
      total_land_size: String(this.totalLandSize),
      crops: this.crops,
      interested_in_biochar: this.interestedInBiochar,
      prior_biochar_exp: this.priorBiocharExp,
      prior_biochar_acreage: this.priorBiocharAcreage
        ? String(this.priorBiocharAcreage)
        : "",
      consent_document_url: this.consentDocumentUrl || "",
      consent_local_uri: this.consentLocalUri || "",
      estimated_biomass: this.estimatedBiomass,
      sync_status: this.syncStatus
    };
  }
}
