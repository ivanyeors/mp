"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function TestRecipientSelect({
  id,
  value,
  recipients,
  onChange,
}: {
  id: string;
  value: string;
  recipients: readonly string[];
  onChange: (email: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full min-w-0">
        <SelectValue placeholder="Pick who gets the test" />
      </SelectTrigger>
      <SelectContent sheetTitle="Send the test to">
        {recipients.map((email) => (
          <SelectItem key={email} value={email}>
            {email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
