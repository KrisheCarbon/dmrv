import PageHeader from "@/components/PageHeader";
import DownloadCsiReportButton from "./DownloadCsiReportButton";
import DownloadRainbowReportButton from "./DownloadRainbowReportButton";

export default function VerificationReportsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Verification Reports"
        description="Download the CSI package or the Rainbow credit package."
      />

      <div className="grid max-w-3xl gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
          <h2 className="mb-3 text-lg font-medium text-brand-dark">CSI</h2>
          <DownloadCsiReportButton />
        </div>
        <div className="rounded-2xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
          <h2 className="mb-3 text-lg font-medium text-brand-dark">Rainbow</h2>
          <DownloadRainbowReportButton />
        </div>
      </div>
    </div>
  );
}
