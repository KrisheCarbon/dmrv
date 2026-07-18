"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import LocationPicker from "@/components/maps/Locationpicker";
import SignedStorageLink from "@/components/SignedStorageLink";
import { BIOCHAR_PRODUCER_DOCS_BUCKET, ORGANIZATION_DOCUMENT_ACCEPT } from "@/lib/privateStorage";
import { supabase } from "@/lib/supabase";
import {
  deleteBiocharProducerDoc,
  fileNameFromBiocharProducerDocPath,
  uploadBiocharProducerDoc,
  uploadBiocharProducerOtherDoc,
  type BiocharProducerDocType,
} from "@/lib/uploadBiocharProducerDocs";
import { createProducer, updateProducer } from "./actions";
import {
  affiliationFromProducer,
  affiliationToSelectValue,
  buildProducerSavePayload,
  createEmptySiteDraft,
  EMPTY_AFFILIATION,
  extractSupervisorIds,
  formatSiteModel,
  isSiteComplete,
  producerRequiresSites,
  resolveSiteAffiliation,
  selectValueToAffiliation,
  siteToDraft,
  validateProducerCore,
  validateProducerSites,
  normalizeOtherDocumentPaths,
} from "./producerLib";
import type { ProducerSavePayload } from "./producerLib";
import type {
  AffiliationFields,
  BiocharProducerClass,
  BiocharProducerDetail,
  BiocharProducerStatus,
  LocationValue,
  ProducerSiteDraft,
  ProducerSiteModel,
} from "@/types";

interface BiocharProducerFormProps {
  mode: "create" | "edit";
  data?: BiocharProducerDetail;
  onCancel?: () => void;
}

const sectionClass = "space-y-4 border-t border-neutral-100 pt-6 first:border-t-0 first:pt-0";
const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20";
const labelClass = "text-sm font-medium text-neutral-800";
const sectionEyebrowClass =
  "text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400";
const operationModelOptions: Array<{
  value: ProducerSiteModel;
  title: string;
  description: string;
  detail: string;
}> = [
  {
    value: "hub",
    title: "Hub",
    description: "Producer works from fixed project sites.",
    detail: "Project site details are required.",
  },
  {
    value: "mobile",
    title: "Mobile",
    description: "Producer operates without fixed project sites.",
    detail: "No project site section is needed.",
  },
  {
    value: "both",
    title: "Hub + Mobile",
    description: "Producer has fixed sites and mobile operations.",
    detail: "Project site details are required.",
  },
];

type ProducerDocState = {
  pendingFile: File | null;
  existingUrl: string | null;
  removed: boolean;
};

function createDocState(existingPath?: string | null): ProducerDocState {
  return {
    pendingFile: null,
    existingUrl: existingPath ?? null,
    removed: false,
  };
}

async function resolveDocumentUrl(
  doc: ProducerDocState,
  producerId: string,
  type: BiocharProducerDocType,
  savedPath?: string | null,
): Promise<string | null | undefined> {
  if (doc.pendingFile) {
    if (savedPath) {
      await deleteBiocharProducerDoc({ path: savedPath }).catch(() => undefined);
    }
    return uploadBiocharProducerDoc({
      file: doc.pendingFile,
      producerId,
      type,
    });
  }

  if (doc.removed) {
    if (savedPath) {
      await deleteBiocharProducerDoc({ path: savedPath }).catch(() => undefined);
    }
    return null;
  }

  return undefined;
}

type PendingOtherDocument = {
  clientId: string;
  file: File;
};

async function resolveOtherDocumentUrls(
  producerId: string,
  savedPaths: string[],
  pendingFiles: PendingOtherDocument[],
  removedPaths: string[],
): Promise<string[] | undefined> {
  if (pendingFiles.length === 0 && removedPaths.length === 0) {
    return undefined;
  }

  for (const path of removedPaths) {
    await deleteBiocharProducerDoc({ path }).catch(() => undefined);
  }

  const remaining = savedPaths.filter((path) => !removedPaths.includes(path));
  const uploaded = await Promise.all(
    pendingFiles.map(({ file }) =>
      uploadBiocharProducerOtherDoc({ file, producerId }),
    ),
  );

  return [...remaining, ...uploaded];
}

async function buildDocumentPatch(
  producerId: string,
  docs: {
    contract: ProducerDocState;
    trainingCert: ProducerDocState;
  },
  saved: {
    contractUrl?: string | null;
    trainingCertUrl?: string | null;
  },
  otherDocs: {
    savedPaths: string[];
    pendingFiles: PendingOtherDocument[];
    removedPaths: string[];
  },
): Promise<Partial<ProducerSavePayload>> {
  const patch: Partial<ProducerSavePayload> = {};

  const contractUrl = await resolveDocumentUrl(
    docs.contract,
    producerId,
    "contract",
    saved.contractUrl,
  );
  if (contractUrl !== undefined) patch.contract_url = contractUrl;

  const trainingCertUrl = await resolveDocumentUrl(
    docs.trainingCert,
    producerId,
    "training_cert",
    saved.trainingCertUrl,
  );
  if (trainingCertUrl !== undefined) patch.training_cert_url = trainingCertUrl;

  const otherDocumentUrls = await resolveOtherDocumentUrls(
    producerId,
    otherDocs.savedPaths,
    otherDocs.pendingFiles,
    otherDocs.removedPaths,
  );
  if (otherDocumentUrls !== undefined) {
    patch.other_document_urls = otherDocumentUrls;
    patch.other_document_url = null;
  }

  return patch;
}

export default function BiocharProducerForm({
  mode,
  data,
  onCancel,
}: BiocharProducerFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [producerId, setProducerId] = useState<string | null>(data?.id ?? null);
  const [generatedProducerCode, setGeneratedProducerCode] = useState(
    data?.producer_code ?? null,
  );
  const [registryProducerId, setRegistryProducerId] = useState(
    data?.registry_producer_id ?? "",
  );
  const [name, setName] = useState(data?.name ?? "");
  const [producerClass, setProducerClass] = useState<BiocharProducerClass>(
    (data?.producer_class as BiocharProducerClass) ?? "artisan_pro",
  );
  const [status, setStatus] = useState<BiocharProducerStatus>(
    (data?.status as BiocharProducerStatus) ?? "active",
  );
  const [producerLocation, setProducerLocation] =
    useState<LocationValue | null>(data?.producer_location ?? null);
  const [contactName, setContactName] = useState(data?.contact_name ?? "");
  const [email, setEmail] = useState(data?.email ?? "");
  const [mobileNumber, setMobileNumber] = useState(data?.mobile_number ?? "");
  const [affiliation, setAffiliation] = useState(
    data ? affiliationFromProducer(data) : EMPTY_AFFILIATION,
  );
  const [operationModel, setOperationModel] = useState<ProducerSiteModel | "">(
    data?.operation_model ?? "",
  );
  const [confirmedSites, setConfirmedSites] = useState<ProducerSiteDraft[]>(
    () => (data?.producer_sites ?? []).map(siteToDraft),
  );
  const [draftSites, setDraftSites] = useState<ProducerSiteDraft[]>([]);
  const [supervisorIds, setSupervisorIds] = useState<string[]>(() =>
    extractSupervisorIds(data?.biochar_producer_supervisors),
  );
  const [contractDoc, setContractDoc] = useState(() =>
    createDocState(data?.contract_url),
  );
  const [trainingCertDoc, setTrainingCertDoc] = useState(() =>
    createDocState(data?.training_cert_url),
  );
  const [savedOtherDocumentPaths] = useState(() =>
    normalizeOtherDocumentPaths(data ?? {}),
  );
  const [pendingOtherDocuments, setPendingOtherDocuments] = useState<
    PendingOtherDocument[]
  >([]);
  const [removedOtherDocumentPaths, setRemovedOtherDocumentPaths] = useState<
    string[]
  >([]);
  const saveInFlight = useRef(false);
  const operationModelSectionRef = useRef<HTMLElement>(null);
  const previousOperationModel = useRef(operationModel);

  const sitesRequired = producerRequiresSites(operationModel);
  const selectedOperationModel = operationModelOptions.find(
    (option) => option.value === operationModel,
  );

  useEffect(() => {
    if (sitesRequired && draftSites.length === 0) {
      setDraftSites([createEmptySiteDraft()]);
    }
    if (!sitesRequired) {
      setDraftSites([]);
      if (!isEdit) setConfirmedSites([]);
    }
  }, [sitesRequired, draftSites.length, isEdit]);

  useEffect(() => {
    if (previousOperationModel.current === operationModel) return;
    previousOperationModel.current = operationModel;
    if (!operationModel) return;

    const main = document.getElementById("admin-main-scroll");
    if (!main) return;

    requestAnimationFrame(() => {
      const maxScroll = Math.max(0, main.scrollHeight - main.clientHeight);
      if (main.scrollTop > maxScroll) {
        main.scrollTop = maxScroll;
      }

      operationModelSectionRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "auto",
      });
    });
  }, [operationModel]);

  function handleOperationModelChange(model: ProducerSiteModel) {
    if (model === operationModel) return;
    setOperationModel(model);
    setError(null);
    if (producerRequiresSites(model) && draftSites.length === 0) {
      setDraftSites([createEmptySiteDraft()]);
    }
  }

  async function handleSave() {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    setError(null);

    if (!producerLocation || !operationModel) {
      setError("Producer location and operating model are required.");
      setSaving(false);
      saveInFlight.current = false;
      return;
    }

    const coreError = validateProducerCore({
      name,
      contactName,
      email,
      mobileNumber,
      producerLocation,
      affiliation,
      operationModel,
    });
    if (coreError) {
      setError(coreError);
      setSaving(false);
      saveInFlight.current = false;
      return;
    }

    if (sitesRequired) {
      const sitesError = validateProducerSites(confirmedSites);
      if (sitesError) {
        setError(sitesError);
        setSaving(false);
        saveInFlight.current = false;
        return;
      }
    }

    try {
      const payload = buildProducerSavePayload({
        registryProducerId,
        name,
        producerClass,
        status,
        producerLocation,
        contactName,
        email,
        mobileNumber,
        affiliation,
        operationModel,
        confirmedSites: sitesRequired ? confirmedSites : [],
        supervisorIds,
        contractUrl: data?.contract_url,
        trainingCertUrl: data?.training_cert_url,
        otherDocumentUrls: normalizeOtherDocumentPaths(data ?? {}),
      });

      if (isEdit && producerId) {
        const docPatch = await buildDocumentPatch(
          producerId,
          {
            contract: contractDoc,
            trainingCert: trainingCertDoc,
          },
          {
            contractUrl: data?.contract_url,
            trainingCertUrl: data?.training_cert_url,
          },
          {
            savedPaths: savedOtherDocumentPaths,
            pendingFiles: pendingOtherDocuments,
            removedPaths: removedOtherDocumentPaths,
          },
        );
        Object.assign(payload, docPatch);
        await updateProducer(producerId, payload);
        router.push(`/network/biochar-producers/${producerId}`);
        return;
      }

      const result = await createProducer(payload);
      const docPatch = await buildDocumentPatch(
        result.id,
        {
          contract: contractDoc,
          trainingCert: trainingCertDoc,
        },
        {},
        {
          savedPaths: savedOtherDocumentPaths,
          pendingFiles: pendingOtherDocuments,
          removedPaths: removedOtherDocumentPaths,
        },
      );
      if (Object.keys(docPatch).length > 0) {
        await updateProducer(result.id, docPatch);
      }
      router.push(`/network/biochar-producers/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save producer");
      setSaving(false);
      saveInFlight.current = false;
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
      <section className={sectionClass}>
        <div>
          <p className={sectionEyebrowClass}>Producer</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Producer details
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Core identity and registration information.
          </p>
        </div>

        {generatedProducerCode ? (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
            <p className="text-xs text-neutral-500">Generated producer ID</p>
            <p className="text-sm font-medium font-mono">{generatedProducerCode}</p>
          </div>
        ) : (
          <p className="text-xs text-neutral-500">
            A system-generated producer ID (e.g. BP-…) is assigned when you save.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <input
            placeholder="Registry producer ID (optional)"
            className={inputClass}
            value={registryProducerId}
            onChange={(e) => setRegistryProducerId(e.target.value)}
          />
          <input
            placeholder="Producer name *"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className={inputClass}
            value={producerClass}
            onChange={(e) =>
              setProducerClass(e.target.value as BiocharProducerClass)
            }
          >
            <option value="artisan_pro">Artisan Pro</option>
            <option value="csink">CSink</option>
            <option value="not_registered">Not Registered</option>
          </select>
          <div className="space-y-1">
            <label className={labelClass}>Status *</label>
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as BiocharProducerStatus)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </section>

      <section className={`${sectionClass}`}>
        <div>
          <p className={sectionEyebrowClass}>Contact</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Contact details
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            The main contact and operating location for this producer.
          </p>
        </div>
        <input
          placeholder="Contact name *"
          className={inputClass}
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="email"
            placeholder="Email *"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            placeholder="Mobile number *"
            className={inputClass}
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
          />
        </div>
        <AffiliationSelect
          label="Affiliation"
          required
          value={affiliation}
          onChange={setAffiliation}
        />
        <div className="space-y-2">
          <label className={labelClass}>Producer location *</label>
          <LocationPicker
            value={producerLocation}
            onChange={setProducerLocation}
          />
        </div>
      </section>

      <section
        ref={operationModelSectionRef}
        className={`${sectionClass} scroll-mt-6`}
      >
        <div>
          <p className={sectionEyebrowClass}>Model</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Operating model *
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Choose how this producer operates. This selection only controls
            which site details are shown below.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Operating model"
          className="grid gap-3 sm:grid-cols-3"
        >
          {operationModelOptions.map((option) => {
            const selected = operationModel === option.value;

            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => handleOperationModelChange(option.value)}
                className={`flex min-h-28 flex-col justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                  selected
                    ? "border-brand-dark-hover bg-white text-neutral-950 shadow-sm ring-2 ring-brand-green/25"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{option.title}</span>
                  <span
                    className={`h-3 w-3 rounded-full border ${
                      selected
                        ? "border-brand-dark-hover bg-brand-green"
                        : "border-neutral-300 bg-white"
                    }`}
                  />
                </span>
                <span>
                  <span className="block leading-5 text-neutral-600">
                    {option.description}
                  </span>
                  <span className="mt-3 block text-xs font-medium text-neutral-500">
                    {option.detail}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {selectedOperationModel ? (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            <span className="font-semibold text-neutral-950">
              {selectedOperationModel.title}
            </span>{" "}
            selected.{" "}
            {sitesRequired
              ? "Add and save at least one project site below before saving this producer."
              : "The project-site form is hidden for this model, keeping the page lighter."}
          </div>
        ) : null}
      </section>

      {sitesRequired ? (
        <ProjectSitesSection
          confirmedSites={confirmedSites}
          onConfirmedChange={setConfirmedSites}
          draftSites={draftSites}
          onDraftChange={setDraftSites}
          required={confirmedSites.length === 0}
        />
      ) : operationModel ? (
        <section className={`${sectionClass} space-y-3`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={sectionEyebrowClass}>Project sites</p>
              <h3 className="mt-1 text-lg font-semibold text-neutral-950">
                Not required for {formatSiteModel(operationModel)}
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                This keeps mobile-only producers simple. Switch back to Hub or
                Hub + Mobile if you need to manage fixed project sites.
              </p>
            </div>
            {confirmedSites.length > 0 ? (
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 ring-1 ring-neutral-200">
                {confirmedSites.length} saved in this form
              </span>
            ) : null}
          </div>
          {confirmedSites.length > 0 ? (
            <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              Existing project sites are hidden while Mobile is selected and
              will not be submitted for this model.
            </p>
          ) : null}
        </section>
      ) : null}

      <SupervisorSection ids={supervisorIds} onChange={setSupervisorIds} />

      <section className={`${sectionClass}`}>
        <div>
          <p className={sectionEyebrowClass}>Files</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Documents{isEdit ? "" : " (optional)"}
          </h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <DocumentUpload
            label="Contract"
            doc={contractDoc}
            onFileChange={(file) =>
              setContractDoc((current) => ({
                ...current,
                pendingFile: file,
                removed: false,
              }))
            }
            onRemove={() =>
              setContractDoc((current) => ({
                ...current,
                pendingFile: null,
                removed: true,
              }))
            }
          />
          <DocumentUpload
            label="Training certification"
            doc={trainingCertDoc}
            onFileChange={(file) =>
              setTrainingCertDoc((current) => ({
                ...current,
                pendingFile: file,
                removed: false,
              }))
            }
            onRemove={() =>
              setTrainingCertDoc((current) => ({
                ...current,
                pendingFile: null,
                removed: true,
              }))
            }
          />
          <div className="sm:col-span-2">
            <MultiDocumentUpload
              label="Other documents"
              savedPaths={savedOtherDocumentPaths.filter(
                (path) => !removedOtherDocumentPaths.includes(path),
              )}
              pendingFiles={pendingOtherDocuments}
              onAddFiles={(files) => {
                setPendingOtherDocuments((current) => [
                  ...current,
                  ...Array.from(files).map((file) => ({
                    clientId: crypto.randomUUID(),
                    file,
                  })),
                ]);
              }}
              onRemoveSaved={(path) =>
                setRemovedOtherDocumentPaths((current) =>
                  current.includes(path) ? current : [...current, path],
                )
              }
              onRemovePending={(clientId) =>
                setPendingOtherDocuments((current) =>
                  current.filter((item) => item.clientId !== clientId),
                )
              }
            />
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover disabled:opacity-50"
        >
          {saving ? "Saving..." : isEdit ? "Save changes" : "Create producer"}
        </button>
      </div>
    </div>
  );
}

// --- Inline sub-components ---

function AffiliationSelect({
  value,
  onChange,
  label = "Affiliation",
  required = false,
}: {
  value: AffiliationFields;
  onChange: (value: AffiliationFields) => void;
  label?: string;
  required?: boolean;
}) {
  const [partners, setPartners] = useState<
    Array<{ id: string; org_name: string }>
  >([]);

  useEffect(() => {
    supabase
      .from("partner_organizations")
      .select("id, org_name")
      .is("deleted_at", null)
      .order("org_name")
      .then(({ data }) => setPartners(data ?? []));
  }, []);

  return (
    <div className="space-y-1">
      <label className={labelClass}>
        {label}
        {required ? " *" : ""}
      </label>
      <select
        className={inputClass}
        value={affiliationToSelectValue(value)}
        onChange={(e) => onChange(selectValueToAffiliation(e.target.value))}
      >
        <option value="">Select affiliation</option>
        <option value="individual">Individual contributor</option>
        <option value="krishe">From Krishe</option>
        {partners.map((p) => (
          <option key={p.id} value={p.id}>
            {p.org_name}
          </option>
        ))}
      </select>
    </div>
  );
}

function MultiDocumentUpload({
  label,
  savedPaths,
  pendingFiles,
  onAddFiles,
  onRemoveSaved,
  onRemovePending,
}: {
  label: string;
  savedPaths: string[];
  pendingFiles: PendingOtherDocument[];
  onAddFiles: (files: FileList) => void;
  onRemoveSaved: (path: string) => void;
  onRemovePending: (clientId: string) => void;
}) {
  const inputKey = useRef(0);
  const hasAttachments = savedPaths.length > 0 || pendingFiles.length > 0;

  function handleAddFiles(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) {
      onAddFiles(event.target.files);
      inputKey.current += 1;
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600">
        {label}
      </label>
      {hasAttachments ? (
        <div className="mb-3 space-y-2">
          {savedPaths.map((path) => (
            <div
              key={path}
              className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <SignedStorageLink
                  bucket={BIOCHAR_PRODUCER_DOCS_BUCKET}
                  path={path}
                  className="truncate text-sm font-medium text-brand-dark hover:underline"
                >
                  {fileNameFromBiocharProducerDocPath(path)}
                </SignedStorageLink>
                <p className="mt-1 text-xs text-neutral-500">Saved document</p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveSaved(path)}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          ))}
          {pendingFiles.map((item) => (
            <div
              key={item.clientId}
              className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {item.file.name}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Ready to upload on save
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemovePending(item.clientId)}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <label className="group flex min-h-28 cursor-pointer items-center justify-between gap-4 rounded-xl border border-dashed border-neutral-300 bg-white px-5 py-4 transition hover:border-neutral-500 hover:bg-neutral-50">
        <span className="min-w-0 text-left">
          <span className="block text-sm font-medium text-neutral-800">
            {hasAttachments ? "Add more documents" : "Select files or drag and drop here"}
          </span>
          <span className="mt-1 block text-xs text-neutral-500">
            PDF or image (JPG, PNG, WEBP). Multiple allowed.
          </span>
        </span>
        <span className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-800 shadow-sm">
          Upload
        </span>
        <input
          key={inputKey.current}
          type="file"
          multiple
          accept={ORGANIZATION_DOCUMENT_ACCEPT}
          onChange={handleAddFiles}
          className="hidden"
        />
      </label>
    </div>
  );
}

function DocumentUpload({
  label,
  doc,
  onFileChange,
  onRemove,
}: {
  label: string;
  doc: ProducerDocState;
  onFileChange: (file: File | null) => void;
  onRemove: () => void;
}) {
  const inputKey = useRef(0);
  const hasAttachment =
    !doc.removed && Boolean(doc.pendingFile || doc.existingUrl);
  const displayName = doc.pendingFile
    ? doc.pendingFile.name
    : doc.existingUrl
      ? fileNameFromBiocharProducerDocPath(doc.existingUrl)
      : null;

  function handleRemove() {
    inputKey.current += 1;
    onRemove();
  }

  return (
    <div>
      <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600">
        {label}
      </label>
      {hasAttachment ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3">
          <div className="min-w-0">
            {doc.pendingFile ? (
              <p className="truncate text-sm font-medium text-neutral-900">
                {displayName}
              </p>
            ) : doc.existingUrl ? (
              <SignedStorageLink
                bucket={BIOCHAR_PRODUCER_DOCS_BUCKET}
                path={doc.existingUrl}
                className="truncate text-sm font-medium text-brand-dark hover:underline"
              >
                {displayName}
              </SignedStorageLink>
            ) : null}
            <p className="mt-1 text-xs text-neutral-500">
              {doc.pendingFile ? "Ready to upload on save" : "Saved document"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
          >
            Remove
          </button>
        </div>
      ) : null}
      <label className="group flex min-h-28 cursor-pointer items-center justify-between gap-4 rounded-xl border border-dashed border-neutral-300 bg-white px-5 py-4 transition hover:border-neutral-500 hover:bg-neutral-50">
        <span className="min-w-0 text-left">
          <span className="block text-sm font-medium text-neutral-800">
            {hasAttachment ? "Replace document" : "Select file or drag and drop here"}
          </span>
          <span className="mt-1 block text-xs text-neutral-500">
            PDF or image (JPG, PNG, WEBP)
          </span>
        </span>
        <span className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-800 shadow-sm">
          Upload
        </span>
        <input
          key={inputKey.current}
          type="file"
          accept={ORGANIZATION_DOCUMENT_ACCEPT}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onFileChange(e.target.files?.[0] ?? null)
          }
          className="hidden"
        />
      </label>
    </div>
  );
}

function SupervisorSection({
  ids,
  onChange,
}: {
  ids: string[];
  onChange: (ids: string[]) => void;
}) {
  const [supervisors, setSupervisors] = useState<
    Array<{ id: string; full_name: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSupervisors() {
      setLoading(true);

      const { data } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("role", "supervisor")
        .order("full_name");

      setSupervisors(
        (data ?? []).map((user) => ({
          id: user.id,
          full_name: user.full_name?.trim() || "Unnamed supervisor",
        })),
      );

      setLoading(false);
    }

    fetchSupervisors();
  }, []);

  const selectedSupervisors = supervisors.filter((supervisor) =>
    ids.includes(supervisor.id),
  );
  const availableSupervisors = supervisors.filter(
    (supervisor) => !ids.includes(supervisor.id),
  );

  function addSupervisor(supervisorId: string) {
    if (!supervisorId || ids.includes(supervisorId)) return;
    onChange([...ids, supervisorId]);
  }

  function removeSupervisor(supervisorId: string) {
    onChange(ids.filter((id) => id !== supervisorId));
  }

  return (
    <section className={sectionClass}>
      <div className="space-y-2">
        <div>
          <p className={sectionEyebrowClass}>Team</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Supervisors
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            Select one or more supervisors for this producer.
          </p>
        </div>

        <select
          className={inputClass}
          value=""
          disabled={loading || availableSupervisors.length === 0}
          onChange={(e) => {
            addSupervisor(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">
            {loading
              ? "Loading supervisors..."
              : availableSupervisors.length === 0
                ? selectedSupervisors.length > 0
                  ? "All supervisors selected"
                  : "No supervisors available"
                : "Add supervisor..."}
          </option>
          {availableSupervisors.map((supervisor) => (
            <option key={supervisor.id} value={supervisor.id}>
              {supervisor.full_name}
            </option>
          ))}
        </select>

        {selectedSupervisors.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {selectedSupervisors.map((supervisor) => (
              <span
                key={supervisor.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
              >
                <span className="text-neutral-500" aria-hidden>
                  &#9679;
                </span>
                {supervisor.full_name}
                <button
                  type="button"
                  onClick={() => removeSupervisor(supervisor.id)}
                  className="ml-0.5 rounded-full px-1 text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-700"
                  aria-label={`Remove ${supervisor.full_name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-500">No supervisors selected yet.</p>
        )}

        {!loading && supervisors.length === 0 ? (
          <p className="text-xs text-amber-700">
            No supervisor accounts found. Add supervisors under Users first.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ProjectSitesSection({
  confirmedSites,
  onConfirmedChange,
  draftSites,
  onDraftChange,
  required,
}: {
  confirmedSites: ProducerSiteDraft[];
  onConfirmedChange: (sites: ProducerSiteDraft[]) => void;
  draftSites: ProducerSiteDraft[];
  onDraftChange: (sites: ProducerSiteDraft[]) => void;
  required?: boolean;
}) {
  function updateDraft(clientId: string, patch: Partial<ProducerSiteDraft>) {
    onDraftChange(
      draftSites.map((s) =>
        s.clientId === clientId ? { ...s, ...patch } : s,
      ),
    );
  }

  function confirmSite(clientId: string) {
    const site = draftSites.find((s) => s.clientId === clientId);
    if (!site || !isSiteComplete(site)) return;
    onConfirmedChange([...confirmedSites, site]);
    const remaining = draftSites.filter((s) => s.clientId !== clientId);
    onDraftChange(
      remaining.length > 0 ? remaining : [createEmptySiteDraft()],
    );
  }

  function editSite(clientId: string) {
    const site = confirmedSites.find((s) => s.clientId === clientId);
    if (!site) return;
    onConfirmedChange(
      confirmedSites.filter((s) => s.clientId !== clientId),
    );
    const hasEmptyDraft =
      draftSites.length === 1 &&
      !draftSites[0].site_name.trim() &&
      !draftSites[0].site_location;
    onDraftChange(
      hasEmptyDraft ? [site] : [site, ...draftSites],
    );
  }

  function removeSite(clientId: string) {
    onConfirmedChange(
      confirmedSites.filter((s) => s.clientId !== clientId),
    );
  }

  function removeDraft(clientId: string) {
    const remaining = draftSites.filter((s) => s.clientId !== clientId);
    onDraftChange(
      remaining.length > 0 ? remaining : [createEmptySiteDraft()],
    );
  }

  return (
    <section className={`${sectionClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={sectionEyebrowClass}>Project sites</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Project sites{required ? " *" : ""}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Save each site locally, then submit the producer once at the bottom.
          </p>
        </div>
        
        {confirmedSites.length > 0 ? (
          <span className="rounded-full bg-brand-green/10 px-3 py-1 text-xs font-medium text-brand-dark ring-1 ring-brand-green/30">
            {confirmedSites.length} ready
          </span>
        ) : null}
      </div>

      {confirmedSites.length > 0 ? (
        <div className="space-y-2">
          {confirmedSites.map((site, index) => {
            const location = site.site_location;
            return (
              <div
                key={site.clientId}
                className="rounded-xl border border-neutral-200 bg-white p-4 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                  <p className="font-medium">
                    Site {index + 1}: {site.site_name}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-brand-green/10 px-2.5 py-1 text-xs font-medium text-brand-dark ring-1 ring-brand-green/30">
                      Ready
                    </span>
                    <button
                      type="button"
                      onClick={() => editSite(site.clientId)}
                      className="rounded-full px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSite(site.clientId)}
                      className="rounded-full px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <p className="text-slate-500">
                  {resolveSiteAffiliation(site)} · {site.site_manager_name}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {location?.place_name ??
                    (location
                      ? `${location.lat}, ${location.lng}`
                      : "No location")}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="space-y-4">
        {draftSites.map((site, index) => {
          const siteNumber = confirmedSites.length + index + 1;
          const complete = isSiteComplete(site);

          return (
            <div
              key={site.clientId}
              className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-medium text-slate-700">
                  Site {siteNumber}
                </h4>
                {draftSites.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeDraft(site.clientId)}
                    className="rounded-full px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <input
                placeholder="Site name *"
                className={inputClass}
                value={site.site_name}
                onChange={(e) =>
                  updateDraft(site.clientId, { site_name: e.target.value })
                }
              />
              <div className="space-y-1">
                <label className={labelClass}>Site location *</label>
                <LocationPicker
                  value={site.site_location}
                  onChange={(loc) =>
                    updateDraft(site.clientId, { site_location: loc })
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  placeholder="Site manager name *"
                  className={inputClass}
                  value={site.site_manager_name}
                  onChange={(e) =>
                    updateDraft(site.clientId, {
                      site_manager_name: e.target.value,
                    })
                  }
                />
                <input
                  type="email"
                  placeholder="Site manager email *"
                  className={inputClass}
                  value={site.site_manager_email}
                  onChange={(e) =>
                    updateDraft(site.clientId, {
                      site_manager_email: e.target.value,
                    })
                  }
                />
                <input
                  placeholder="Site manager mobile *"
                  className={inputClass}
                  value={site.site_manager_mobile}
                  onChange={(e) =>
                    updateDraft(site.clientId, {
                      site_manager_mobile: e.target.value,
                    })
                  }
                />
              </div>
              <AffiliationSelect
                label="Site affiliation"
                required
                value={site}
                onChange={(aff) => updateDraft(site.clientId, aff)}
              />
              {complete ? (
                <button
                  type="button"
                  onClick={() => confirmSite(site.clientId)}
                  className="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
                >
                  Save site
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onDraftChange([...draftSites, createEmptySiteDraft()])}
        className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-50"
      >
        + Add site
      </button>
    </section>
  );
}
