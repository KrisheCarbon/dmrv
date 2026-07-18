import { Model } from "@nozbe/watermelondb";
import { field, text, json } from "@nozbe/watermelondb/decorators";
import type { FarmerCrop, FarmerForm } from "@krishecarbon/shared";

export default class Farmer extends Model {
  static table = "farmers";

  @text("server_id") serverId!: string | null;
  @text("farmer_name") farmerName!: string;
  @text("mobile_number") mobileNumber!: string;
  @field("latitude") latitude!: number;
  @field("longitude") longitude!: number;
  @text("address") address!: string;
  @field("total_land_size") totalLandSize!: number;
  @json("crops", (raw) => (Array.isArray(raw) ? raw : [])) crops!: FarmerCrop[];
  @field("interested_in_biochar") interestedInBiochar!: boolean;
  @field("prior_biochar_exp") priorBiocharExp!: boolean;
  @field("prior_biochar_acreage") priorBiocharAcreage!: number | null;
  @text("consent_document_url") consentDocumentUrl!: string | null;
  @text("consent_local_uri") consentLocalUri!: string | null;
  @field("estimated_biomass") estimatedBiomass!: number;
  @text("created_by") createdBy!: string;
  @text("assigned_to") assignedTo!: string;
  @text("sync_status") uploadStatus!: string;
  @text("sync_error") syncError!: string | null;
  @field("created_at") createdAt!: number;
  @field("updated_at") updatedAt!: number;

  toFormData(): FarmerForm & { id: string; sync_status: string; sync_error?: string | null } {
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
      sync_status: this.uploadStatus,
      sync_error: this.syncError,
    };
  }
}
