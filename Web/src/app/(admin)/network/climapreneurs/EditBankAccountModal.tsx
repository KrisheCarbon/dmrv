"use client";

import Modal from "@/components/Modal";
import BankAccountForm from "./BankAccountForm";
import type { Climapreneur } from "@/types";

interface EditBankAccountModalProps {
  climapreneur: Climapreneur | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditBankAccountModal({
  climapreneur,
  onClose,
  onSuccess,
}: EditBankAccountModalProps) {
  if (!climapreneur) return null;

  const displayName =
    climapreneur.full_name?.trim() || climapreneur.email || "Climapreneur";
  const isEdit = climapreneur.has_bank_account;

  return (
    <Modal
      open={Boolean(climapreneur)}
      onClose={onClose}
      title={isEdit ? `Edit bank details — ${displayName}` : `Add bank details — ${displayName}`}
    >
      <BankAccountForm
        embedded
        climapreneurId={climapreneur.id}
        data={climapreneur.bank_account}
        onCancel={onClose}
        onSuccess={onSuccess}
      />
    </Modal>
  );
}
