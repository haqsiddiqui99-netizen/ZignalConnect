"use client";

import { useState } from "react";
import { TaxMode } from "@/components/tax-controls";

export function InvoiceTaxFields() {
  const [tax, setTax] = useState("included");
  const [customTax, setCustomTax] = useState("18");

  return (
    <TaxMode
      label="Tax on invoice"
      name="invoice_tax"
      percentName="invoice_tax_percent"
      mode={tax}
      custom={customTax}
      onMode={setTax}
      onCustom={setCustomTax}
      includedRate={18}
    />
  );
}
