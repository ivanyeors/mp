import { loadSelfPurchaseAllowance } from "@/lib/partner-self-purchase/allowance";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export async function SelfPurchaseAllowanceCard({ partnerId }: { partnerId: string }) {
  const a = await loadSelfPurchaseAllowance(partnerId);
  if (!a.kind || a.amount <= 0 || a.unitCap <= 0) return null;

  const rate =
    a.kind === "percent" ? `${a.amount}% off` : `$${a.amount.toFixed(2)} off per unit`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your partner pricing</CardTitle>
        <CardDescription>
          {rate} MSRP on pillows &amp; bolsters you buy in your own account, up to {a.unitCap}{" "}
          units. Self-purchases don&apos;t earn commission — the better price is the reward.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">
          <span className="font-medium">{a.remaining}</span> of {a.unitCap} discounted units
          remaining.
        </p>
      </CardContent>
    </Card>
  );
}
