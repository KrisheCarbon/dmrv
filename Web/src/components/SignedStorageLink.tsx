"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createSignedStorageUrl } from "@/lib/privateStorage";

interface SignedStorageLinkProps {
  bucket: string;
  path: string;
  className?: string;
  children: ReactNode;
}

export default function SignedStorageLink({
  bucket,
  path,
  className,
  children,
}: SignedStorageLinkProps) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    createSignedStorageUrl(bucket, path).then((signed) => {
      if (!cancelled) setHref(signed);
    });

    return () => {
      cancelled = true;
    };
  }, [bucket, path]);

  if (!href) {
    return <span className="text-xs text-neutral-400">Loading document...</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}
