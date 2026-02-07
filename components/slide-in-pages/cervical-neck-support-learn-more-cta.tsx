"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { openCervicalNeckSupportSheet } from "@/components/slide-in-pages/cervical-neck-support";
import { useI18n } from "@/lib/i18n/use-i18n";

export function CervicalNeckSupportLearnMoreCta({ className }: { className?: string }) {
  const { m } = useI18n();

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={() => openCervicalNeckSupportSheet()}
    >
      {m.common.learnMore}
    </Button>
  );
}

