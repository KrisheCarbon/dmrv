import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReactNode } from "react";

import type { UserRole } from "@krishecarbon/shared";

export type { UserRole };
export type UserStatus = "pending_auth" | "active" | "disabled";

export interface UserProfile {
  id: string;
  email: string;
  phone?: string | null;
  role: UserRole | string;
  status: UserStatus | string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
}

export interface UserFormData {
  email: string;
  phone: string;
  role: UserRole | string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  status?: string;
}

export interface RoiIntent {
  id: string;
  status: string;
  query_type: string;
  created_at: string;
  decision_at?: string | null;
  [key: string]: unknown;
}

export interface LocationValue {
  lat: number;
  lng: number;
  place_name?: string | null;
  source?: string;
  raw?: unknown;
  raw_url?: string;
}

export interface VillageLocationValue extends LocationValue {
  village?: string;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  mapbox_place_id?: string;
}

export interface DataTableColumn<T = Record<string, unknown>> {
  key: string;
  label: string;
  render?: (value: unknown, row: T) => ReactNode;
}

export interface AccordionItem {
  key: string;
  title: string;
  content: ReactNode;
  actions?: ReactNode;
}

export interface KeyValueItem extends Record<string, unknown> {
  label: string;
  value: ReactNode;
}

export type AppSupabaseClient = SupabaseClient;

export interface SignupCheckResult {
  allowed: boolean;
  reason?: "not_found" | "disabled" | "already_active" | "unknown";
}

export interface CreateUserResult {
  email: string;
  signupUrl: string;
  emailSent: boolean;
}

export interface FetchIntentsResult {
  ok: boolean;
  intents?: RoiIntent[];
  error?: string;
}

export interface ModalCallbacks {
  onClose: () => void;
  onSuccess: () => void;
}

export interface IntentConfirmState {
  type: "accept" | "reject";
  intent: RoiIntent;
}

export type {
  ArtisanPro,
  ArtisanProDetail,
  ArtisanProTableRow,
  AffiliationFields,
  BiocharProducer,
  BiocharProducerClass,
  BiocharProducerStatus,
  BiocharProducerDetail,
  BiocharProducerTableRow,
  ClusterDetail,
  ClusterTableRow,
  Climapreneur,
  ClimapreneurBankAccount,
  ClimapreneurTableRow,
  FarmerCrop,
  FarmerTableRow,
  FarmDetail,
  FeedstockDetail,
  FeedstockLabStatus,
  FeedstockProducerRef,
  FeedstockTableRow,
  KilnBatchDetail,
  KilnBatchSummary,
  KilnBatchTableRow,
  KilnTemperatureReading,
  MethaneCompensationStrategy,
  KontikkiDetail,
  KontikkiStatus,
  KontikkiTableRow,
  PartnerOrg,
  ProducerKontikkiRow,
  ProducerSite,
  ProducerSiteDraft,
  ProducerSiteModel,
  ProducerSupervisorAssignment,
  Supervisor,
  UserTableRow,
} from "./entities";
