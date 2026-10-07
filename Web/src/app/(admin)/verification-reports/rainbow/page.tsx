import PageHeader from "@/components/PageHeader";
import { backendQuery } from "@/lib/backendApi";
import RainbowCreditDesk, { type RainbowCreditInputs } from "./RainbowCreditDesk";

export default async function RainbowCreditPage() {
  const result = await backendQuery<RainbowCreditInputs>(
    "/verification-reports/rainbow/inputs",
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Rainbow credit records"
        description="Store the lab, pollutant, methane, leakage, and soil-temperature records, then download the Rainbow credit package."
      />
      {result.error || !result.data ? (
        <p className="text-sm text-brand-dark">
          {result.error ?? "Rainbow credit records could not be loaded. Apply migration 042, then reload."}
        </p>
      ) : (
        <RainbowCreditDesk inputs={result.data} />
      )}
    </div>
  );
}
