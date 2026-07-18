import type { LocationValue, UserProfile, VillageLocationValue } from "./index";

/** Loose row type for Supabase query results until generated types are added. */
export type DbRow = Record<string, unknown>;

export interface ArtisanPro extends DbRow {
  id: string;
  name?: string;
  artisan_pro_code?: string;
  dmrv_id?: string;
}

export interface ArtisanProFeedstock extends DbRow {
  feedstock_name: string;
}

export interface ArtisanProVillage extends DbRow {
  id: string;
  village_name: string;
  location?: LocationValue | null;
}

export interface ArtisanProDetail extends ArtisanPro {
  gps_location?: LocationValue | null;
  estimated_production_m3_year?: string | number;
  real_production_last_year_m3?: string | number;
  proper_end_use_confirmed?: boolean;
  first_internal_inspection?: string;
  last_internal_inspection?: string;
  last_supervisor_name?: string;
  last_unannounced_inspection?: string;
  artisan_pro_feedstocks?: ArtisanProFeedstock[];
  artisan_pro_villages?: ArtisanProVillage[];
  kontikkis?: { id: string; kontikki_code: string }[];
}

export interface ArtisanProTableRow extends DbRow {
  id: string;
  code: string;
  name: string;
  villages: number;
  kontikkis: number;
  production: string | number;
}

export interface KontikkiOperatorAssignment extends DbRow {
  operator_id: string;
  users?: {
    id: string;
    full_name?: string;
  };
}

export interface Kontikki extends DbRow {
  id: string;
  kontikki_code?: string;
  module_id?: string | null;
  status?: KontikkiStatus;
  kp_number?: string | null;
  biochar_producer_id?: string | null;
  artisan_pro?: { id: string; name: string } | { id: string; name: string }[];
  kontikki_operators?: KontikkiOperatorAssignment[];
}

export type KontikkiStatus = "active" | "inactive";

export interface KontikkiDetail extends Kontikki {
  top_diameter_cm?: string | number;
  bottom_diameter_cm?: string | number;
  depth_cm?: string | number;
  capacity?: number | string | null;
  top_photo_urls?: string[] | null;
  bottom_photo_urls?: string[] | null;
  top_photo_url?: string;
  side_photo_url?: string;
  plan_pdf_url?: string;
  artisan_pro?: { id: string; name: string };
  biochar_producer?: { id: string; name: string; producer_code?: string };
  producer?: { id: string; name: string };
}

export interface KontikkiTableRow extends DbRow {
  id: string;
  kontikki_code: string;
  module_id: string;
  producer: string;
  producer_id: string | null;
  capacity: string;
  operators: string;
  status: string;
}

export interface Cluster extends DbRow {
  id: string;
  cluster_name?: string;
}

export interface ClusterTableRow extends DbRow {
  id: string;
  cluster_name: string;
  villages: number;
  farmers: number;
  acres: number;
  biochar: number;
  created_by: string;
}

export interface ClusterVillageCrop extends DbRow {
  crop_type?: string;
  feedstock_type?: string;
  biomass_use_case?: string;
  acres?: number;
  sowing_date?: string;
  estimated_harvest_date?: string;
  estimated_biochar_m3_per_year?: number;
}

export interface ClusterVillage extends DbRow {
  id: string;
  village_name: string;
  number_of_farmers?: number;
  location?: VillageLocationValue | null;
  clusters_villages_crops?: ClusterVillageCrop[];
}

export interface ClusterDetail extends DbRow {
  id: string;
  name: string;
  created_by_name?: string;
  clusters_villages?: ClusterVillage[];
}

export interface Farmer extends DbRow {
  id: string;
  name?: string;
  biomass?: unknown;
}

export interface FarmerTableRow extends DbRow {
  id: string;
  name: string;
  mobile: string;
  address: string;
  landSize: number;
  biomass: number;
}

/** Full row from the public.farms table. */
export interface FarmDetail extends DbRow {
  id: string;
  farmer_name: string;
  mobile_number: string | null;
  latitude: number;
  longitude: number;
  address: string;
  total_land_size: number;
  crops: FarmerCrop[];
  interested_in_biochar: boolean;
  prior_biochar_exp: boolean;
  prior_biochar_acreage: number | null;
  consent_document_url: string | null;
  estimated_biomass: number;
  created_by: string;
  assigned_to: string;
  created_at?: string;
  updated_at?: string;
}

export interface FarmerCrop {
  crop: string;
  acreage: number;
  sowing_date: string;
  estimated_harvest_date: string;
}

export interface Partner extends DbRow {
  id: string;
  name?: string;
}

export interface PartnerOrg extends Partner {
  org_name: string;
  cin_number?: string | null;
  base_location?: string;
  farmer_base?: number;
  status?: string;
  last_modified_at?: string;
  states_of_operation?: string[];
  crop_types?: string[];
  bank_account_holders_name?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  bank_name?: string;
  bank_branch?: string;
  bank_address?: string;
  pan_card_url?: string | null;
  mou_url?: string | null;
}

export interface Supervisor extends DbRow {
  id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  status?: string;
}

export interface ClimapreneurBankAccount extends DbRow {
  id: string;
  user_id: string;
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  branch: string;
  bank_address: string;
  upi_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Climapreneur extends DbRow {
  id: string;
  email: string;
  phone?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  status?: string | null;
  created_at?: string;
  bank_account?: ClimapreneurBankAccount | null;
  has_bank_account: boolean;
}

export interface ClimapreneurTableRow extends DbRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  bankDetails: string;
  raw: Climapreneur;
}

export type BiocharProducerClass = "artisan_pro" | "csink" | "not_registered";

export type BiocharProducerStatus = "active" | "inactive";

export type ProducerSiteModel = "hub" | "mobile" | "both";

export interface ProducerSite extends DbRow {
  id: string;
  biochar_producer_id?: string;
  site_name?: string | null;
  site_model?: ProducerSiteModel;
  site_location?: LocationValue | null;
  partner_organization_id?: string | null;
  is_individual_contributor?: boolean;
  is_from_krishe?: boolean;
  site_manager_name?: string | null;
  site_manager_email?: string | null;
  site_manager_mobile?: string | null;
  partner_organizations?: {
    id: string;
    org_name: string;
  } | null;
}

export interface ProducerSupervisorAssignment extends DbRow {
  supervisor_id: string;
  users?: {
    id: string;
    full_name?: string;
    email?: string;
    phone?: string;
  };
}

export interface ProducerKontikkiRow extends DbRow {
  id: string;
  kontikki_code?: string;
  status?: string;
  kontikki_operators?: KontikkiOperatorAssignment[];
}

export interface BiocharProducer extends DbRow {
  id: string;
  producer_code?: string;
  registry_producer_id?: string | null;
  name?: string;
  producer_class?: BiocharProducerClass;
  status?: BiocharProducerStatus;
  contact_name?: string;
  email?: string;
  mobile_number?: string;
  producer_location?: LocationValue | null;
  operation_model?: ProducerSiteModel | null;
  partner_organization_id?: string | null;
  is_individual_contributor?: boolean;
  is_from_krishe?: boolean;
  partner_organizations?: {
    id: string;
    org_name: string;
  } | null;
  contract_url?: string | null;
  training_cert_url?: string | null;
  other_document_url?: string | null;
  other_document_urls?: string[] | null;
}

export interface BiocharProducerDetail extends BiocharProducer {
  producer_sites?: ProducerSite[];
  biochar_producer_supervisors?: ProducerSupervisorAssignment[];
  kontikkis?: ProducerKontikkiRow[];
}

export interface BiocharProducerTableRow extends DbRow {
  id: string;
  code: string;
  registryId: string;
  name: string;
  producer_class: string;
  contact_name: string;
  mobile_number: string;
  models: string;
  sites: number;
}

export interface AffiliationFields {
  partner_organization_id: string;
  is_individual_contributor: boolean;
  is_from_krishe: boolean;
}

export interface ProducerSiteDraft extends AffiliationFields {
  clientId: string;
  site_name: string;
  site_location: LocationValue | null;
  site_manager_name: string;
  site_manager_email: string;
  site_manager_mobile: string;
}

export interface UserTableRow extends DbRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  raw: UserProfile;
}

export type FeedstockLabStatus =
  | "estimated"
  | "waiting_for_results"
  | "analysis_completed"
  | "superseded";

export type MethaneCompensationStrategy =
  | "offsetting_from_scp_fraction"
  | "csi_approved_avoidance_of_ghg";

export interface FeedstockProducerRef extends DbRow {
  id: string;
  name?: string;
  producer_code?: string | null;
}

export interface FeedstockDetail extends DbRow {
  id: string;
  biomass_type: string;
  biochar_producer_id: string;
  biochar_bulk_density_kg_m3: number;
  carbon_content_percent: number;
  hc_ratio: number;
  lab_status: FeedstockLabStatus;
  lab_submission_date?: string | null;
  lab_analysis_date?: string | null;
  biomass_preparation_instruction?: string | null;
  methane_compensation_strategy: MethaneCompensationStrategy;
  lab_report_doc_url?: string | null;
  lab_report_image_url?: string | null;
  ghg_avoidance_approval_doc_url?: string | null;
  ghg_avoidance_approval_image_url?: string | null;
  biochar_producer?:
    | FeedstockProducerRef
    | FeedstockProducerRef[]
    | null;
  created_at?: string;
  updated_at?: string;
}

export interface FeedstockTableRow extends DbRow {
  id: string;
  biomass_type: string;
  producer: string;
  producer_id: string;
  lab_status: string;
  bulk_density: string;
  carbon_content: string;
}

export interface KilnTemperatureReading {
  time_offset_seconds: number;
  temperature: number;
  recorded_at: string;
}

export interface KilnBatchSummary extends DbRow {
  id: string;
  batch_name: string;
  kiln_id: string;
  kontikki_id: string | null;
  kontikki_code: string | null;
  latitude: number;
  longitude: number;
  start_time_utc: string;
  duration_seconds: number;
  ended_at: string;
  source_filename: string;
  created_at: string;
}

export interface KilnBatchDetail extends KilnBatchSummary {
  readings: KilnTemperatureReading[];
}

export interface KilnBatchTableRow extends DbRow {
  id: string;
  batch_name: string;
  kontikki_code: string;
  kiln_id: string;
  start_time: string;
  duration: string;
  data_points: string;
}
