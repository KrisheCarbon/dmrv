"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import SignedStorageLink from "@/components/SignedStorageLink";
import { deleteFarm, getFarm } from "../../farms/actions";
import { listFarmFields, updateFarmField } from "../../fields/actions";
import {
  attachSoilReport,
  listSoilTests,
  reviewSoilTest,
} from "../../soil-tests/actions";
import { listFarmerConsents } from "../actions";
import FarmerChecklist from "../FarmerChecklist";
import FarmPlotForm from "../FarmPlotForm";
import ConsentCreateForm from "../ConsentCreateForm";
import SoilSampleCreateForm from "../SoilSampleCreateForm";
import { buildFarmerChecklist, consentExpiryLabel } from "../farmerLib";
import FarmerPortrait from "@/components/FarmerPortrait";
import {
  SOIL_REPORT_ACCEPT,
  uploadSoilReportPdf,
} from "@/lib/uploadSoilReports";
import {
  RECEIVE_PHOTO_ACCEPT,
  uploadSoilReceivePhoto,
} from "@/lib/uploadFarmerNetworkPhotos";
import type { FarmDetail, FarmerCrop } from "@/types";
import type {
  FarmerConsentRecord,
  FarmFieldRecord,
  SoilTestRecord,
} from "@krishecarbon/shared";
import {
  FARMER_NETWORK_PHOTOS_BUCKET,
  SOIL_REPORTS_BUCKET,
  parseBoundaryGeojson,
  soilTestStatusLabel,
} from "@krishecarbon/shared";

const TABS = [
  { key: "info", label: "Farmer info" },
  { key: "farms", label: "Farms" },
  { key: "samples", label: "Soil samples" },
  { key: "reports", label: "Reports" },
  { key: "consent", label: "Consent" },
] as const;

type ReviewDecision = "accept" | "reject" | "store";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-100 py-3 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-8">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

function OptionalRow({
  label,
  value,
}: {
  label: string;
  value?: ReactNode;
}) {
  if (value == null || value === "" || value === "—") return null;
  return <DetailRow label={label}>{value}</DetailRow>;
}

function formatYesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function formatGps(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return null;
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function statusClass(status: string) {
  if (status === "rejected") return "bg-red-50 text-red-700";
  if (status === "accepted" || status === "received" || status === "reported") {
    return "bg-emerald-50 text-emerald-800";
  }
  if (status === "collected" || status === "submitted" || status === "stored") {
    return "bg-amber-50 text-amber-800";
  }
  return "bg-neutral-100 text-neutral-600";
}

function PhotoLinks({ paths }: { paths?: string[] | null }) {
  if (!paths?.length) return null;
  return (
    <span className="flex flex-col gap-1">
      {paths.map((path) => (
        <SignedStorageLink
          key={path}
          bucket={FARMER_NETWORK_PHOTOS_BUCKET}
          path={path}
          className="font-medium text-brand-dark hover:underline"
        >
          View photo
        </SignedStorageLink>
      ))}
    </span>
  );
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export default function FarmerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("info");
  const [data, setData] = useState<FarmDetail | null>(null);
  const [fields, setFields] = useState<FarmFieldRecord[]>([]);
  const [soilTests, setSoilTests] = useState<SoilTestRecord[]>([]);
  const [consents, setConsents] = useState<FarmerConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<SoilTestRecord | null>(null);
  const [review, setReview] = useState<{
    test: SoilTestRecord;
    decision: ReviewDecision;
  } | null>(null);
  const [editingField, setEditingField] = useState<FarmFieldRecord | null>(null);
  const [createKind, setCreateKind] = useState<"farm" | "sample" | "consent" | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [receiveFile, setReceiveFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadFarmer = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const farm = await getFarm(id);
      setData(farm);
      const [fieldResult, soilResult, consentResult] = await Promise.allSettled([
        listFarmFields(id),
        listSoilTests(id),
        listFarmerConsents(id),
      ]);
      setFields(fieldResult.status === "fulfilled" ? fieldResult.value : []);
      setSoilTests(soilResult.status === "fulfilled" ? soilResult.value : []);
      setConsents(
        consentResult.status === "fulfilled" ? consentResult.value : [],
      );
      const extraErrors = [fieldResult, soilResult, consentResult]
        .filter((result) => result.status === "rejected")
        .map((result) => errorMessage(result.reason, "Failed to load related data"));
      if (extraErrors.length) {
        setError(extraErrors.join(" · "));
      }
    } catch (err) {
      setError(errorMessage(err, "Failed to load farmer"));
      setData(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadFarmer();
  }, [loadFarmer]);

  async function handleDelete() {
    if (!data?.id) return;
    const confirmed = window.confirm(
      "This will permanently delete this farmer record.\n\nContinue?",
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteFarm(data.id);
      router.push("/network/farmers");
    } catch (err) {
      setError(errorMessage(err, "Failed to delete farmer"));
      setDeleting(false);
    }
  }

  async function handleInactive(field: FarmFieldRecord) {
    const confirmed = window.confirm(
      "Mark this farm inactive? Use when a lease ends or the plot changes.",
    );
    if (!confirmed) return;
    try {
      await updateFarmField(field.id, { status: "inactive" });
      await loadFarmer();
    } catch (err) {
      setError(errorMessage(err, "Failed to update farm"));
    }
  }

  async function handleReview() {
    if (!review) return;
    setSaving(true);
    setFormError(null);
    try {
      let receivePhotoUrl = review.test.receive_photo_url || null;
      if (receiveFile) {
        receivePhotoUrl = await uploadSoilReceivePhoto({
          file: receiveFile,
          soilTestId: review.test.id,
        });
      }
      await reviewSoilTest(review.test.id, {
        decision: review.decision,
        receive_photo_url: receivePhotoUrl,
      });
      setReview(null);
      setReceiveFile(null);
      await loadFarmer();
    } catch (err) {
      setFormError(errorMessage(err, "Failed to update sample"));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload() {
    if (!selected) return;
    if (!pdfFile) {
      setFormError("Choose a PDF to upload.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const path = await uploadSoilReportPdf({
        file: pdfFile,
        soilTestId: selected.id,
      });
      await attachSoilReport(selected.id, {
        document_url: path,
        source: "Lab report",
      });
      setSelected(null);
      setPdfFile(null);
      await loadFarmer();
    } catch (err) {
      setFormError(errorMessage(err, "Upload failed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading...</p>;
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">Could not load farmer: {error}</p>
        <button
          type="button"
          onClick={() => router.push("/network/farmers")}
          className="text-sm text-brand-dark hover:underline"
        >
          Back to farmers
        </button>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-red-600">Farmer not found.</p>;
  }

  const crops = Array.isArray(data.crops) ? data.crops : [];
  const checklist = buildFarmerChecklist(fields, soilTests, consents, data);
  const reports = soilTests.flatMap((test) =>
    (test.reports ?? []).map((report) => ({ test, report })),
  );
  const latestConsent = consents[0] ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/network/farmers")}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to farmers
        </button>
        <div className="mt-2 flex items-start gap-4">
          <FarmerPortrait
            src={data.farmer_photo_url}
            alt={data.farmer_name}
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
              {data.farmer_name}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {data.farmer_code ? `Farmer ID ${data.farmer_code} · ` : ""}
              {data.cluster?.name ? `${data.cluster.name} · ` : ""}
              {[data.village, data.mandal, data.district, data.state]
                .filter(Boolean)
                .join(", ") || data.address || "No location recorded"}
              {" · "}
              {consentExpiryLabel(latestConsent)}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <FarmerChecklist
            hasCompleteProfile={checklist.hasCompleteProfile}
            hasFarms={checklist.hasFarms}
            sampleTone={checklist.sampleTone}
            hasReport={checklist.hasReport}
            hasConsent={checklist.hasConsent}
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tab === item.key
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "info" ? (
        <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-neutral-900">Farmer info</h2>
            <div className="flex items-center gap-2">
              <Link
                href={`/network/farmers/${data.id}/edit`}
                className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center justify-center rounded-xl border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
          <dl className="px-6 py-2">
            <DetailRow label="Farmer photo">
              {data.farmer_photo_url ? (
                <FarmerPortrait
                  src={data.farmer_photo_url}
                  alt={data.farmer_name}
                  className="h-40 w-40 rounded-xl object-cover"
                />
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label="Farmer name">{data.farmer_name}</DetailRow>
            <DetailRow label="Farmer ID">{data.farmer_code || "—"}</DetailRow>
            <DetailRow label="Mobile">{data.mobile_number ?? "—"}</DetailRow>
            <DetailRow label="Father / spouse">
              {data.father_spouse_name || "—"}
            </DetailRow>
            <DetailRow label="Agri ID">{data.agri_id || "—"}</DetailRow>
            <DetailRow label="Address">{data.address || "—"}</DetailRow>
            <DetailRow label="Cluster">{data.cluster?.name || "—"}</DetailRow>
            <DetailRow label="Village">{data.village || "—"}</DetailRow>
            <DetailRow label="Mandal / block">{data.mandal || "—"}</DetailRow>
            <DetailRow label="District">{data.district || "—"}</DetailRow>
            <DetailRow label="State">{data.state || "—"}</DetailRow>
            <DetailRow label="Coordinates">
              {formatGps(data.latitude, data.longitude) || "—"}
            </DetailRow>
            <DetailRow label="Cultivated land">{data.total_land_size} acres</DetailRow>
            <DetailRow label="Owned">{data.owned_land_size ?? "—"}</DetailRow>
            <DetailRow label="Leased">{data.leased_land_size ?? "—"}</DetailRow>
            <DetailRow label="Estimated biomass">
              {data.estimated_biomass} tons
            </DetailRow>
            <DetailRow label="Interested in biochar">
              {formatYesNo(data.interested_in_biochar)}
            </DetailRow>
            <DetailRow label="Prior biochar experience">
              {formatYesNo(data.prior_biochar_exp)}
            </DetailRow>
            <DetailRow label="Prior biochar acres">
              {data.prior_biochar_acreage ?? "—"}
            </DetailRow>
          </dl>
          <div className="border-t border-neutral-100 px-6 py-4">
            <h3 className="text-sm font-semibold text-neutral-900">Crops</h3>
            {crops.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">No crops recorded.</p>
            ) : (
              <div className="mt-2 divide-y divide-neutral-100">
                {crops.map((crop: FarmerCrop, index: number) => (
                  <p key={`${crop.crop}-${index}`} className="py-2 text-sm">
                    {crop.crop} · {crop.acreage} acres
                    {crop.sowing_date ? ` · sown ${crop.sowing_date}` : ""}
                    {crop.estimated_harvest_date
                      ? ` · harvest ${crop.estimated_harvest_date}`
                      : ""}
                  </p>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {tab === "farms" ? (
        <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Farms</h2>
              <p className="mt-0.5 text-sm text-neutral-500">
                Farms mapped here or in the field app. Area is in acres.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateKind("farm")}
              className="rounded-xl bg-brand-dark px-3 py-1.5 text-sm font-medium text-white"
            >
              + Add farm
            </button>
          </div>
          <div className="space-y-4 px-6 py-4">
            {fields.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No farms recorded yet. Add a farm here or from the field app.
              </p>
            ) : (
              fields.map((field) => {
                const points = parseBoundaryGeojson(field.boundary_geojson);
                return (
                  <div
                    key={field.id}
                    className="rounded-xl border border-neutral-200 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-neutral-900">
                        {field.field_code} · {field.ownership_type}
                        {field.status === "inactive" ? " (inactive)" : ""}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          field.status === "inactive"
                            ? "bg-neutral-100 text-neutral-600"
                            : "bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {field.status || "active"}
                      </span>
                    </div>
                    <dl>
                      <DetailRow label="Area">
                        {field.calculated_area != null
                          ? `${field.calculated_area} acres`
                          : "—"}
                      </DetailRow>
                      <OptionalRow label="Water" value={field.water_source} />
                      <OptionalRow label="Crop" value={field.crop_name} />
                      <OptionalRow label="Season" value={field.season} />
                      <OptionalRow
                        label="Sowing / harvest"
                        value={
                          field.sowing_date || field.harvest_date
                            ? `${field.sowing_date || "—"} → ${field.harvest_date || "—"}`
                            : null
                        }
                      />
                      <OptionalRow
                        label="GPS"
                        value={formatGps(field.latitude, field.longitude)}
                      />
                      <OptionalRow
                        label="Boundary"
                        value={
                          points.length
                            ? `Mapped (${points.length} points)`
                            : null
                        }
                      />
                      <OptionalRow label="Land reference" value={field.land_reference} />
                      <OptionalRow
                        label="Lease"
                        value={
                          field.lease_start || field.lease_end
                            ? `${field.lease_start || "—"} → ${field.lease_end || "—"}`
                            : null
                        }
                      />
                      <OptionalRow label="Notes" value={field.notes} />
                      <OptionalRow
                        label="Farm photos"
                        value={<PhotoLinks paths={field.photos} />}
                      />
                      <OptionalRow
                        label="Crop photos"
                        value={<PhotoLinks paths={field.crop_photos} />}
                      />
                    </dl>
                    {field.status === "active" ? (
                      <div className="mt-2 flex gap-3">
                        <button
                          type="button"
                          onClick={() => setEditingField(field)}
                          className="text-sm font-medium text-brand-dark hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInactive(field)}
                          className="text-sm font-medium text-neutral-500 hover:text-neutral-800"
                        >
                          Mark inactive
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingField(field)}
                        className="mt-2 text-sm font-medium text-brand-dark hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      ) : null}

      {tab === "samples" ? (
        <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Soil samples</h2>
              <p className="mt-0.5 text-sm text-neutral-500">
                Yellow = collected or waiting, red = rejected, green = accepted.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateKind("sample")}
              className="rounded-xl bg-brand-dark px-3 py-1.5 text-sm font-medium text-white"
            >
              + Add sample
            </button>
          </div>
          <div className="px-6 py-4">
            {soilTests.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No soil samples collected yet.
              </p>
            ) : (
              <div className="space-y-4">
                {soilTests.map((test) => (
                  <div
                    key={test.id}
                    className="rounded-xl border border-neutral-200 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-neutral-900">
                        Sample {test.sample_date}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(String(test.status))}`}
                      >
                        {soilTestStatusLabel(test.status)}
                      </span>
                    </div>
                    <dl>
                      <DetailRow label="Farms">
                        {test.fields?.map((field) => field.field_code).filter(Boolean).join(", ") ||
                          "—"}
                      </DetailRow>
                      <DetailRow label="Collected by">
                        {test.collected_by_user?.full_name?.trim() ||
                          test.collected_by_role ||
                          "—"}
                      </DetailRow>
                      <OptionalRow
                        label="Supervisor"
                        value={test.submitted_to_supervisor?.full_name?.trim()}
                      />
                      <OptionalRow
                        label="GPS"
                        value={formatGps(test.sample_lat, test.sample_lng)}
                      />
                      <OptionalRow
                        label="Received"
                        value={
                          test.received_at
                            ? `${test.received_at.slice(0, 10)}${
                                test.received_by_user?.full_name
                                  ? ` · ${test.received_by_user.full_name}`
                                  : ""
                              }`
                            : null
                        }
                      />
                      <OptionalRow
                        label="Sample photo"
                        value={
                          test.sample_photo_url ? (
                            <SignedStorageLink
                              bucket={FARMER_NETWORK_PHOTOS_BUCKET}
                              path={test.sample_photo_url}
                              className="font-medium text-brand-dark hover:underline"
                            >
                              View sample photo
                            </SignedStorageLink>
                          ) : null
                        }
                      />
                      <OptionalRow
                        label="Receive photo"
                        value={
                          test.receive_photo_url ? (
                            <SignedStorageLink
                              bucket={FARMER_NETWORK_PHOTOS_BUCKET}
                              path={test.receive_photo_url}
                              className="font-medium text-brand-dark hover:underline"
                            >
                              View receive photo
                            </SignedStorageLink>
                          ) : null
                        }
                      />
                    </dl>
                    {test.status === "submitted" || test.status === "stored" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReview({ test, decision: "accept" });
                            setReceiveFile(null);
                            setFormError(null);
                          }}
                          className="rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReview({ test, decision: "reject" });
                            setReceiveFile(null);
                            setFormError(null);
                          }}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReview({ test, decision: "store" });
                            setReceiveFile(null);
                            setFormError(null);
                          }}
                          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                        >
                          Store
                        </button>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(test);
                        setPdfFile(null);
                        setFormError(null);
                      }}
                      className="mt-3 text-sm font-medium text-brand-dark hover:underline"
                    >
                      {test.reports?.length ? "Replace report PDF" : "Upload report PDF"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {tab === "reports" ? (
        <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-neutral-900">Soil reports</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Lab PDFs uploaded after a sample is accepted.
            </p>
          </div>
          <div className="px-6 py-4">
            {reports.length === 0 ? (
              <p className="text-sm text-neutral-500">No lab reports uploaded yet.</p>
            ) : (
              <div className="divide-y divide-neutral-100">
                {reports.map(({ test, report }) => (
                  <div key={report.id} className="py-3">
                    <p className="text-sm font-medium">
                      {report.report_date || test.sample_date}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {report.source || "Lab report"} · sample {test.sample_date}
                    </p>
                    {report.results_summary ? (
                      <p className="mt-1 text-sm text-neutral-600">
                        {report.results_summary}
                      </p>
                    ) : null}
                    {report.document_url ? (
                      <SignedStorageLink
                        bucket={SOIL_REPORTS_BUCKET}
                        path={report.document_url}
                        className="text-sm font-medium text-brand-dark hover:underline"
                      >
                        Open PDF
                      </SignedStorageLink>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {tab === "consent" ? (
        <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Farmer consent</h2>
            </div>
            <button
              type="button"
              onClick={() => setCreateKind("consent")}
              className="rounded-xl bg-brand-dark px-3 py-1.5 text-sm font-medium text-white"
            >
              + Add consent
            </button>
          </div>
          <div className="px-6 py-4">
            {consents.length === 0 ? (
              <p className="text-sm text-neutral-500">No farmer consent recorded.</p>
            ) : (
              <div className="space-y-4">
                {consents.map((consent) => (
                  <div
                    key={consent.id}
                    className="rounded-xl border border-neutral-200 px-4 py-3"
                  >
                    <dl>
                      <DetailRow label="Status">
                        {consentExpiryLabel(consent)}
                      </DetailRow>
                      <DetailRow label="Signed">{consent.consent_date}</DetailRow>
                      <DetailRow label="Expires">{consent.valid_to || "—"}</DetailRow>
                      <OptionalRow
                        label="Notes"
                        value={consent.evidence_notes}
                      />
                      <DetailRow label="Photos">
                        {consent.photos?.length ? (
                          <PhotoLinks paths={consent.photos} />
                        ) : (
                          "—"
                        )}
                      </DetailRow>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Upload soil report"
        footer={
          <>
            <button
              type="button"
              onClick={() => setSelected(null)}
              disabled={saving}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={saving}
              className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Uploading..." : "Save report"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Farmer: {data.farmer_name} · Sample {selected?.sample_date}
          </p>
          <input
            type="file"
            accept={SOIL_REPORT_ACCEPT}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setPdfFile(e.target.files?.[0] ?? null)
            }
            className="block w-full text-sm text-neutral-700 file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-4 file:py-2 file:text-sm file:font-medium"
          />
          {formError && selected ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(review)}
        onClose={() => setReview(null)}
        title={
          review?.decision === "accept"
            ? "Accept sample"
            : review?.decision === "reject"
              ? "Reject sample"
              : "Store sample"
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setReview(null)}
              disabled={saving}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReview}
              disabled={saving}
              className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Confirm"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            {data.farmer_name} · Sample {review?.test.sample_date}
          </p>
          <p className="text-sm text-neutral-500">
            Optional: attach a photo of the physical sample, same as supervisors do
            in the field app.
          </p>
          <input
            type="file"
            accept={RECEIVE_PHOTO_ACCEPT}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setReceiveFile(e.target.files?.[0] ?? null)
            }
            className="block w-full text-sm text-neutral-700 file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-4 file:py-2 file:text-sm file:font-medium"
          />
          {formError && review ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={createKind === "farm" || Boolean(editingField)}
        onClose={() => {
          setCreateKind(null);
          setEditingField(null);
        }}
        title={editingField ? "Edit farm" : "Add farm"}
      >
        <FarmPlotForm
          farmerId={data.id}
          cultivatedLand={Number(data.total_land_size) || 0}
          usedArea={fields
            .filter((field) => field.status !== "inactive")
            .reduce((sum, field) => sum + Number(field.calculated_area ?? 0), 0)}
          initial={editingField}
          onCancel={() => {
            setCreateKind(null);
            setEditingField(null);
          }}
          onSaved={async () => {
            setCreateKind(null);
            setEditingField(null);
            await loadFarmer();
          }}
        />
      </Modal>

      <Modal
        open={createKind === "sample"}
        onClose={() => setCreateKind(null)}
        title="Add soil sample"
      >
        <SoilSampleCreateForm
          farmerId={data.id}
          fields={fields}
          latitude={data.latitude}
          longitude={data.longitude}
          onCancel={() => setCreateKind(null)}
          onSaved={async () => {
            setCreateKind(null);
            await loadFarmer();
          }}
        />
      </Modal>

      <Modal
        open={createKind === "consent"}
        onClose={() => setCreateKind(null)}
        title="Add farmer consent"
      >
        <ConsentCreateForm
          farmerId={data.id}
          onCancel={() => setCreateKind(null)}
          onSaved={async () => {
            setCreateKind(null);
            await loadFarmer();
          }}
        />
      </Modal>
    </div>
  );
}
