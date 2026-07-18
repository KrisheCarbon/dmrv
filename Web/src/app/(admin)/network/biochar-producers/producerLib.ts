import type {
  AffiliationFields,
  BiocharProducerClass,
  BiocharProducerStatus,
  LocationValue,
  ProducerSite,
  ProducerSiteDraft,
  ProducerSiteModel,
} from "@/types";

// --- Affiliation ---

export const EMPTY_AFFILIATION: AffiliationFields = {
  partner_organization_id: "",
  is_individual_contributor: false,
  is_from_krishe: false,
};

export function affiliationToSelectValue(fields: AffiliationFields): string {
  if (fields.is_individual_contributor) return "individual";
  if (fields.is_from_krishe) return "krishe";
  return fields.partner_organization_id || "";
}

export function selectValueToAffiliation(value: string): AffiliationFields {
  if (value === "individual") {
    return {
      partner_organization_id: "",
      is_individual_contributor: true,
      is_from_krishe: false,
    };
  }
  if (value === "krishe") {
    return {
      partner_organization_id: "",
      is_individual_contributor: false,
      is_from_krishe: true,
    };
  }
  return {
    partner_organization_id: value,
    is_individual_contributor: false,
    is_from_krishe: false,
  };
}

export function isAffiliationComplete(fields: AffiliationFields): boolean {
  if (fields.is_individual_contributor || fields.is_from_krishe) return true;
  return Boolean(fields.partner_organization_id);
}

export function resolveAffiliationLabel(
  fields: AffiliationFields & {
    partner_organizations?:
      | { org_name?: string }
      | { org_name?: string }[]
      | null;
  },
): string {
  if (fields.is_individual_contributor) return "Individual contributor";
  if (fields.is_from_krishe) return "From Krishe";
  const partner = fields.partner_organizations;
  const orgName = Array.isArray(partner)
    ? partner[0]?.org_name
    : partner?.org_name;
  return orgName?.trim() || "—";
}

export function resolveSiteAffiliation(site: {
  is_individual_contributor?: boolean;
  is_from_krishe?: boolean;
  partner_organizations?:
    | { org_name?: string }
    | { org_name?: string }[]
    | null;
}): string {
  if (site.is_from_krishe) return "From Krishe";
  if (site.is_individual_contributor) return "Individual contributor";
  const partner = site.partner_organizations;
  const orgName = Array.isArray(partner)
    ? partner[0]?.org_name
    : partner?.org_name;
  return orgName?.trim() || "—";
}

export function producerRequiresSites(operationModel?: string | null): boolean {
  return operationModel === "hub" || operationModel === "both";
}

export function affiliationToDb(fields: AffiliationFields) {
  return {
    partner_organization_id:
      fields.is_individual_contributor || fields.is_from_krishe
        ? null
        : fields.partner_organization_id || null,
    is_individual_contributor: fields.is_individual_contributor,
    is_from_krishe: fields.is_from_krishe,
  };
}

export function affiliationFromProducer(row: {
  partner_organization_id?: string | null;
  is_individual_contributor?: boolean;
  is_from_krishe?: boolean;
}): AffiliationFields {
  return {
    partner_organization_id: row.partner_organization_id ?? "",
    is_individual_contributor: Boolean(row.is_individual_contributor),
    is_from_krishe: Boolean(row.is_from_krishe),
  };
}

// --- Sites ---

export function createEmptySiteDraft(): ProducerSiteDraft {
  return {
    clientId: crypto.randomUUID(),
    site_name: "",
    site_location: null,
    site_manager_name: "",
    site_manager_email: "",
    site_manager_mobile: "",
    ...EMPTY_AFFILIATION,
  };
}

export function siteToDraft(site: ProducerSite): ProducerSiteDraft {
  return {
    clientId: site.id,
    site_name: site.site_name ?? "",
    site_location: site.site_location ?? null,
    site_manager_name: site.site_manager_name ?? "",
    site_manager_email: site.site_manager_email ?? "",
    site_manager_mobile: site.site_manager_mobile ?? "",
    partner_organization_id: site.partner_organization_id ?? "",
    is_individual_contributor: site.is_individual_contributor ?? false,
    is_from_krishe: site.is_from_krishe ?? false,
  };
}

// --- Validation ---

export function isLocationComplete(
  location: LocationValue | null | undefined,
): boolean {
  return Boolean(location?.lat && location?.lng);
}

export function isSiteComplete(site: ProducerSiteDraft): boolean {
  return (
    Boolean(site.site_name.trim()) &&
    isLocationComplete(site.site_location) &&
    Boolean(site.site_manager_name.trim()) &&
    Boolean(site.site_manager_email.trim()) &&
    Boolean(site.site_manager_mobile.trim()) &&
    isAffiliationComplete(site)
  );
}

export function validateProducerCore(input: {
  name: string;
  contactName: string;
  email: string;
  mobileNumber: string;
  producerLocation: LocationValue | null;
  affiliation: AffiliationFields;
  operationModel: ProducerSiteModel | "";
}): string | null {
  if (!input.name.trim()) return "Producer name is required.";
  if (!input.contactName.trim()) return "Contact name is required.";
  if (!input.email.trim()) return "Email is required.";
  if (!input.mobileNumber.trim()) return "Mobile number is required.";
  if (!isLocationComplete(input.producerLocation)) {
    return "Producer location is required.";
  }
  if (!isAffiliationComplete(input.affiliation)) {
    return "Affiliation is required.";
  }
  if (!input.operationModel) {
    return "Select an operating model: Hub, Mobile, or Both.";
  }
  return null;
}

export function validateProducerSites(
  sites: ProducerSiteDraft[],
): string | null {
  if (sites.length === 0) return "Add at least one project site.";
  const incomplete = sites.find((site) => !isSiteComplete(site));
  if (incomplete) {
    return "Each project site needs a name, location, site manager details, and affiliation.";
  }
  return null;
}

// --- Display formatters ---

export function formatProducerClass(value?: string) {
  if (value === "artisan_pro") return "Artisan Pro";
  if (value === "csink") return "CSink";
  if (value === "not_registered") return "Not Registered";
  return value ?? "—";
}

export function formatSiteModel(value?: string) {
  if (value === "hub") return "Hub";
  if (value === "mobile") return "Mobile";
  if (value === "both") return "Hub + Mobile";
  return value ?? "—";
}

export function resolveSupervisorNames(
  assignments:
    | Array<{
        users?: { full_name?: string } | { full_name?: string }[] | null;
      }>
    | null
    | undefined,
): string {
  if (!assignments?.length) return "None";
  const names = assignments
    .map((row) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      return user?.full_name?.trim();
    })
    .filter((name): name is string => Boolean(name));
  return names.length ? names.join(", ") : "None";
}

export function resolveKontikkiOperators(
  assignments:
    | Array<{
        users?: { full_name?: string } | { full_name?: string }[] | null;
      }>
    | null
    | undefined,
): string {
  if (!assignments?.length) return "—";
  const names = assignments
    .map((row) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      return user?.full_name?.trim();
    })
    .filter((name): name is string => Boolean(name));
  return names.length ? names.join(", ") : "—";
}

export function extractSupervisorIds(
  assignments:
    | Array<{
        supervisor_id?: string;
        users?: { id?: string } | { id?: string }[] | null;
      }>
    | null
    | undefined,
): string[] {
  if (!assignments?.length) return [];
  return assignments
    .map((row) => {
      if (row.supervisor_id) return row.supervisor_id;
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      return user?.id;
    })
    .filter((id): id is string => Boolean(id));
}

// --- API payload ---

export interface ProducerSitePayload {
  site_name: string;
  site_location: LocationValue;
  site_manager_name: string;
  site_manager_email: string;
  site_manager_mobile: string;
  partner_organization_id?: string | null;
  is_individual_contributor?: boolean;
  is_from_krishe?: boolean;
}

export interface ProducerSavePayload {
  registry_producer_id?: string | null;
  name: string;
  producer_class: string;
  status: BiocharProducerStatus;
  producer_location: LocationValue;
  contact_name?: string | null;
  email?: string | null;
  mobile_number?: string | null;
  operation_model: ProducerSiteModel;
  partner_organization_id?: string | null;
  is_individual_contributor?: boolean;
  is_from_krishe?: boolean;
  contract_url?: string | null;
  training_cert_url?: string | null;
  other_document_url?: string | null;
  other_document_urls?: string[] | null;
  sites?: ProducerSitePayload[];
  supervisor_ids?: string[];
}

function siteDraftToPayload(site: ProducerSiteDraft): ProducerSitePayload {
  return {
    site_name: site.site_name.trim(),
    site_location: site.site_location!,
    site_manager_name: site.site_manager_name.trim(),
    site_manager_email: site.site_manager_email.trim(),
    site_manager_mobile: site.site_manager_mobile.trim(),
    partner_organization_id:
      site.is_individual_contributor || site.is_from_krishe
        ? null
        : site.partner_organization_id || null,
    is_individual_contributor: site.is_individual_contributor,
    is_from_krishe: site.is_from_krishe,
  };
}

export function buildProducerSavePayload(input: {
  registryProducerId: string;
  name: string;
  producerClass: BiocharProducerClass;
  status: BiocharProducerStatus;
  producerLocation: LocationValue;
  contactName: string;
  email: string;
  mobileNumber: string;
  affiliation: AffiliationFields;
  operationModel: ProducerSiteModel;
  confirmedSites: ProducerSiteDraft[];
  supervisorIds: string[];
  contractUrl?: string | null;
  trainingCertUrl?: string | null;
  otherDocumentUrl?: string | null;
  otherDocumentUrls?: string[] | null;
}): ProducerSavePayload {
  const payload: ProducerSavePayload = {
    registry_producer_id: input.registryProducerId.trim() || null,
    name: input.name.trim(),
    producer_class: input.producerClass,
    status: input.status,
    producer_location: input.producerLocation,
    contact_name: input.contactName.trim(),
    email: input.email.trim(),
    mobile_number: input.mobileNumber.trim(),
    operation_model: input.operationModel,
    supervisor_ids: input.supervisorIds,
    ...affiliationToDb(input.affiliation),
  };

  if (input.confirmedSites.length > 0) {
    payload.sites = input.confirmedSites.map(siteDraftToPayload);
  }
  if (input.contractUrl !== undefined) payload.contract_url = input.contractUrl;
  if (input.trainingCertUrl !== undefined) {
    payload.training_cert_url = input.trainingCertUrl;
  }
  if (input.otherDocumentUrl !== undefined) {
    payload.other_document_url = input.otherDocumentUrl;
  }
  if (input.otherDocumentUrls !== undefined) {
    payload.other_document_urls = input.otherDocumentUrls;
  }

  return payload;
}

export function normalizeOtherDocumentPaths(producer: {
  other_document_urls?: string[] | null;
  other_document_url?: string | null;
}): string[] {
  if (producer.other_document_urls?.length) {
    return producer.other_document_urls.filter(Boolean);
  }
  if (producer.other_document_url) {
    return [producer.other_document_url];
  }
  return [];
}
