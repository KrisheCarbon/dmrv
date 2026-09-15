"use client";

import { useEffect, useState } from "react";
import DocumentUploadField, {
  createDocumentUploadState,
  type DocumentUploadState,
} from "@/components/DocumentUploadField";
import {
  BIOCHAR_PRODUCER_DOCS_BUCKET,
  deleteBiocharProducerDoc,
  fileNameFromBiocharProducerDocPath,
  uploadBiocharProducerDoc,
} from "@/lib/uploadBiocharProducerDocs";
import { updateProducer } from "./actions";

interface ProducerDocumentsSectionProps {
  producerId: string;
  contractUrl?: string | null;
  trainingCertUrl?: string | null;
  onUpdated: () => void;
}

async function resolveDocumentUrl(
  doc: DocumentUploadState,
  producerId: string,
  type: "contract" | "training_cert",
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

export default function ProducerDocumentsSection({
  producerId,
  contractUrl,
  trainingCertUrl,
  onUpdated,
}: ProducerDocumentsSectionProps) {
  const [contractDoc, setContractDoc] = useState(() =>
    createDocumentUploadState(contractUrl),
  );
  const [trainingCertDoc, setTrainingCertDoc] = useState(() =>
    createDocumentUploadState(trainingCertUrl),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setContractDoc(createDocumentUploadState(contractUrl));
    setTrainingCertDoc(createDocumentUploadState(trainingCertUrl));
  }, [contractUrl, trainingCertUrl]);

  const hasChanges =
    contractDoc.pendingFile !== null ||
    contractDoc.removed ||
    trainingCertDoc.pendingFile !== null ||
    trainingCertDoc.removed;

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);

    try {
      const patch: {
        contract_url?: string | null;
        training_cert_url?: string | null;
      } = {};

      const nextContractUrl = await resolveDocumentUrl(
        contractDoc,
        producerId,
        "contract",
        contractUrl,
      );
      if (nextContractUrl !== undefined) {
        patch.contract_url = nextContractUrl;
      }

      const nextTrainingCertUrl = await resolveDocumentUrl(
        trainingCertDoc,
        producerId,
        "training_cert",
        trainingCertUrl,
      );
      if (nextTrainingCertUrl !== undefined) {
        patch.training_cert_url = nextTrainingCertUrl;
      }

      if (Object.keys(patch).length > 0) {
        await updateProducer(producerId, patch);
      }

      setSaved(true);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save documents");
    }

    setSaving(false);
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40">
      <div className="border-b border-neutral-100 px-6 py-4">
        <h2 className="text-lg font-semibold text-neutral-900">Documents</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Upload producer contracts and training certificates.
        </p>
      </div>

      <div className="space-y-6 px-6 py-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <DocumentUploadField
            label="Contract"
            bucket={BIOCHAR_PRODUCER_DOCS_BUCKET}
            doc={contractDoc}
            fileNameFromPath={fileNameFromBiocharProducerDocPath}
            disabled={saving}
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
          <DocumentUploadField
            label="Training certificate"
            bucket={BIOCHAR_PRODUCER_DOCS_BUCKET}
            doc={trainingCertDoc}
            fileNameFromPath={fileNameFromBiocharProducerDocPath}
            disabled={saving}
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
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {saved ? (
          <p className="text-sm text-brand-dark">Documents saved.</p>
        ) : null}

        {hasChanges ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save documents"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
