import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import DownloadCsiReportButton from "./DownloadCsiReportButton";

export default function VerificationReportsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Verification Reports"
        description="Download the CSI package, or open the Rainbow credit records and submission package."
      />

      <div className="grid max-w-3xl gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
          <h2 className="mb-3 text-lg font-medium text-brand-dark">CSI</h2>
          <DownloadCsiReportButton />
        </div>
        <div className="rounded-2xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-lg font-medium text-brand-dark">Rainbow</h2>
          <p className="my-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            Lab H/Corg, pollutants, methane, permanence, leakage, and the credit download.
          </p>
          <Link
            href="/verification-reports/rainbow"
            className="inline-flex min-h-14 items-center rounded-xl bg-brand-dark px-4 text-sm font-medium text-white"
          >
            Open Rainbow credit records
          </Link>
        </div>
      </div>
    </div>
  );
}
