"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";
import { BrandButton } from "./ui/BrandButton";

interface CopyLinkButtonProps {
  url: string;
  label?: string;
  variant?: "lime" | "cobalt" | "red";
}

export function CopyLinkButton({ url, label = "Copy link", variant = "cobalt" }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <BrandButton onClick={handleCopy} variant={variant}>
      {copied ? (
        <>
          <Check size={16} /> Copied
        </>
      ) : (
        <>
          <Link2 size={16} /> {label}
        </>
      )}
    </BrandButton>
  );
}
