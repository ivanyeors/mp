"use client";

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CustomerAddress } from "@/lib/types/ecommerce";

export const NEW_ADDRESS = "new";

export type HoldShippingAddress = {
  recipient: string;
  line1: string;
  line2: string;
  city: string;
  /** Asked only where couriers need one (lib/shipping/states). */
  state?: string;
  postal_code: string;
  country: string;
};

export function toHoldShippingAddress(a: CustomerAddress): HoldShippingAddress {
  return {
    recipient: a.recipient,
    line1: a.line1,
    line2: a.line2 ?? "",
    city: a.city,
    state: a.state ?? "",
    postal_code: a.postal_code,
    country: a.country || "SG",
  };
}

/** Prefill email + default saved address for signed-in shoppers; fields stay editable. */
export function useSavedShippingPrefill(
  setEmail: Dispatch<SetStateAction<string>>,
  setAddress: Dispatch<SetStateAction<HoldShippingAddress>>,
) {
  const [signedIn, setSignedIn] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState(NEW_ADDRESS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/addresses")
      .then((res) => res.json())
      .then(
        (data: {
          signedIn?: boolean;
          addresses?: CustomerAddress[];
          email?: string | null;
        }) => {
          if (cancelled || !data?.signedIn) return;
          setSignedIn(true);
          const addresses = Array.isArray(data.addresses) ? data.addresses : [];
          setSavedAddresses(addresses);
          setEmail((prev) => prev || data.email || "");
          const preferred = addresses[0];
          if (preferred) {
            setSelectedAddressId(preferred.id);
            setAddress(toHoldShippingAddress(preferred));
          }
        },
      )
      .catch(() => {
        /* anonymous — nothing to load */
      });
    return () => {
      cancelled = true;
    };
  }, [setEmail, setAddress]);

  const handleSelectAddress = useCallback(
    (id: string) => {
      setSelectedAddressId(id);
      if (id === NEW_ADDRESS) {
        setAddress((prev) => ({
          recipient: "",
          line1: "",
          line2: "",
          city: "",
          postal_code: "",
          country: prev.country || "SG",
        }));
        return;
      }
      const match = savedAddresses.find((a) => a.id === id);
      if (match) setAddress(toHoldShippingAddress(match));
    },
    [savedAddresses, setAddress],
  );

  return { signedIn, savedAddresses, selectedAddressId, handleSelectAddress };
}

export function SavedAddressSelect({
  signedIn,
  addresses,
  value,
  onValueChange,
}: {
  signedIn: boolean;
  addresses: CustomerAddress[];
  value: string;
  onValueChange: (id: string) => void;
}) {
  if (!signedIn || addresses.length === 0) return null;
  return (
    <div className="space-y-2">
      <Label htmlFor="saved_address">Use a saved address</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id="saved_address">
          <SelectValue placeholder="Select a saved address" />
        </SelectTrigger>
        <SelectContent>
          {addresses.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {(a.label ? `${a.label} — ` : "") +
                `${a.recipient}, ${a.line1}, ${a.city}`}
              {a.is_default ? " (default)" : ""}
            </SelectItem>
          ))}
          <SelectItem value={NEW_ADDRESS}>Enter a new address</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
