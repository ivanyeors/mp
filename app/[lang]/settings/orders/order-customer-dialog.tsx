"use client";

import { useRef, useState } from "react";
import { ArrowRight, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { LifecycleStageBadge } from "@/app/[lang]/settings/customers/lifecycle-stage-badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import type { CustomerOverviewRow } from "@/lib/crm/customer-overview";
import { customerDisplayName } from "@/lib/results/result-customer";

export type OrderCustomer = { id: string; name: string; email: string };

type Mode = "existing" | "new";

type Found = { q: string; rows: CustomerOverviewRow[]; failed: boolean };

type NewCustomerErrors = { email?: string; phone?: string; form?: string };

const MIN_SEARCH = 2;

function toOrderCustomer(row: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
}): OrderCustomer {
    return { id: row.id, name: customerDisplayName(row) ?? row.email, email: row.email };
}

export function OrderCustomerDialog({
    canCreateCustomer,
    onClose,
    onPicked,
}: {
    canCreateCustomer: boolean;
    onClose: () => void;
    onPicked: (customer: OrderCustomer) => void;
}) {
    const [mode, setMode] = useState<Mode>("existing");
    const [query, setQuery] = useState("");
    const [found, setFound] = useState<Found | null>(null);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [busy, setBusy] = useState(false);
    const [errors, setErrors] = useState<NewCustomerErrors>({});

    const latestSearch = useRef(0);
    const search = useDebouncedCallback(async (q: string) => {
        const mine = ++latestSearch.current;
        let answer: Found = { q, rows: [], failed: true };
        try {
            const params = new URLSearchParams({ search: q, limit: "6", page: "1" });
            const res = await fetch(`/api/shop/customers?${params.toString()}`);
            const json = await res.json().catch(() => null);
            if (res.ok) answer = { q, rows: (json?.rows ?? []) as CustomerOverviewRow[], failed: false };
        } catch {}
        if (mine === latestSearch.current) setFound(answer);
    }, 300);

    const q = query.trim();
    const searchable = q.length >= MIN_SEARCH;
    const current = searchable && found?.q === q ? found : null;
    const searching = searchable && !current;

    const changeQuery = (value: string) => {
        setQuery(value);
        const next = value.trim();
        if (next.length >= MIN_SEARCH) {
            search(next);
            return;
        }
        search.cancel();
        latestSearch.current++;
    };

    const startNewFromSearch = () => {
        if (q.includes("@")) setEmail(q);
        else setFirstName(q);
        setMode("new");
    };

    const create = async () => {
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
            setErrors({ email: "An email is needed to create a customer." });
            return;
        }
        setErrors({});
        setBusy(true);
        try {
            const res = await fetch("/api/shop/customers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: email.trim(),
                    first_name: firstName.trim() || undefined,
                    last_name: lastName.trim() || undefined,
                    phone: phone.trim() || undefined,
                }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.row) {
                const message = typeof json?.error === "string" ? json.error : "Couldn't create the customer.";
                if (json?.field === "email") setErrors({ email: message });
                else if (json?.field === "phone") setErrors({ phone: message });
                else setErrors({ form: message });
                return;
            }
            const customer = toOrderCustomer(json.row);
            toast.success(
                json.created
                    ? `${customer.name} is now a customer.`
                    : `${customer.email} is already a customer: using their record.`,
            );
            onPicked(customer);
        } catch {
            setErrors({ form: "Couldn't create the customer. Check your connection and try again." });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>New order</DialogTitle>
                    <DialogDescription>
                        {canCreateCustomer
                            ? "Who is it for? Pick a customer, or add a new one."
                            : "Who is it for? Pick a customer."}
                    </DialogDescription>
                </DialogHeader>

                {canCreateCustomer ? (
                    <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                        <TabsList className="w-full">
                            <TabsTrigger value="existing" className="flex-1">
                                Existing customer
                            </TabsTrigger>
                            <TabsTrigger value="new" className="flex-1">
                                New customer
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                ) : null}

                {mode === "existing" ? (
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="order-customer-search">Find by name, email or mobile</Label>
                        <Input
                            id="order-customer-search"
                            autoFocus
                            autoComplete="off"
                            value={query}
                            onChange={(e) => changeQuery(e.target.value)}
                            placeholder="e.g. Jorge or jorge@…"
                        />
                        <div aria-live="polite">
                            {searching ? (
                                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                                </p>
                            ) : current?.failed ? (
                                <p className="text-xs text-destructive">
                                    Couldn&apos;t search. Check your connection and type again.
                                </p>
                            ) : current && current.rows.length === 0 ? (
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-xs text-muted-foreground">Nobody matches. Try another spelling.</p>
                                    {canCreateCustomer ? (
                                        <Button type="button" size="sm" variant="outline" onClick={startNewFromSearch}>
                                            <UserPlus className="h-4 w-4" />
                                            Add as new customer
                                        </Button>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                        {current && current.rows.length > 0 ? (
                            <ul className="divide-y rounded-md border" aria-label="Customers">
                                {current.rows.map((c) => {
                                    const name = customerDisplayName(c);
                                    return (
                                        <li key={c.id}>
                                            <button
                                                type="button"
                                                onClick={() => onPicked(toOrderCustomer(c))}
                                                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none active:bg-press"
                                            >
                                                <span className="min-w-0">
                                                    <span className="block truncate font-medium">{name ?? c.email}</span>
                                                    <span className="block truncate text-xs text-muted-foreground">
                                                        {c.email}
                                                        {c.phone ? ` · ${c.phone}` : ""}
                                                    </span>
                                                </span>
                                                <span className="flex shrink-0 items-center gap-2">
                                                    <LifecycleStageBadge stage={c.lifecycle_stage} />
                                                    <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : null}
                    </div>
                ) : (
                    <form
                        className="min-w-0 space-y-4"
                        noValidate
                        onSubmit={(e) => {
                            e.preventDefault();
                            void create();
                        }}
                    >
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="min-w-0 space-y-1.5">
                                <Label htmlFor="order-customer-first-name">First name</Label>
                                <Input
                                    id="order-customer-first-name"
                                    autoFocus
                                    autoComplete="off"
                                    maxLength={120}
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                />
                            </div>
                            <div className="min-w-0 space-y-1.5">
                                <Label htmlFor="order-customer-last-name">Last name</Label>
                                <Input
                                    id="order-customer-last-name"
                                    autoComplete="off"
                                    maxLength={120}
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="order-customer-email">
                                Email <span className="text-muted-foreground">(required)</span>
                            </Label>
                            <Input
                                id="order-customer-email"
                                type="email"
                                inputMode="email"
                                autoComplete="off"
                                value={email}
                                aria-invalid={Boolean(errors.email)}
                                aria-describedby="order-customer-email-help"
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@example.com"
                            />
                            <p id="order-customer-email-help" className="text-xs text-muted-foreground">
                                The payment link is emailed here. If someone already has this email, the order goes
                                under their record: nobody is created twice.
                            </p>
                            {errors.email ? (
                                <p role="alert" className="text-xs text-destructive">
                                    {errors.email}
                                </p>
                            ) : null}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="order-customer-phone">
                                Mobile <span className="text-muted-foreground">(encouraged)</span>
                            </Label>
                            <Input
                                id="order-customer-phone"
                                type="tel"
                                inputMode="tel"
                                autoComplete="off"
                                value={phone}
                                aria-invalid={Boolean(errors.phone)}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="9123 4567"
                            />
                            {errors.phone ? (
                                <p role="alert" className="text-xs text-destructive">
                                    {errors.phone}
                                </p>
                            ) : null}
                        </div>
                        {errors.form ? (
                            <p role="alert" className="text-sm text-destructive">
                                {errors.form}
                            </p>
                        ) : null}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={busy || !email.trim()}>
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                                Create customer and continue
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
