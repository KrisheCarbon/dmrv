import PageHeader from "@/components/PageHeader";
import DownloadCsiReportButton from "./DownloadCsiReportButton";

export default function VerificationReportsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Verification Reports"
        description="Download the CSI Global Artisan C-Sink package built from submitted application records."
      />

      <div className="max-w-xl rounded-2xl border border-gray-200 bg-white p-6">
        <DownloadCsiReportButton />
      </div>
    </div>
  );
}
