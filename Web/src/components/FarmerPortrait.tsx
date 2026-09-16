"use client";

import { useEffect, useState } from "react";
import { createSignedStorageUrl } from "@/lib/privateStorage";
import { FARMER_NETWORK_PHOTOS_BUCKET } from "@krishecarbon/shared";

export default function FarmerPortrait({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    if (!src?.trim()) {
      setHref(null);
      return;
    }

    if (
      src.startsWith("blob:") ||
      src.startsWith("data:") ||
      src.startsWith("http://") ||
      src.startsWith("https://")
    ) {
      setHref(src);
      return;
    }

    let cancelled = false;
    createSignedStorageUrl(FARMER_NETWORK_PHOTOS_BUCKET, src).then((signed) => {
      if (!cancelled) setHref(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!href) return null;

  return <img src={href} alt={alt} className={className} />;
}
