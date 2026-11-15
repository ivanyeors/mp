"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Contact, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { formatAdminDateMY, formatAdminDateTimeMY } from "@/lib/format/admin-date";
import type { Customer } from "@/lib/types/ecommerce";
import type { MigratedCustomerFacts, MigratedCustomerResult } from "@/lib/customer-migration/overview";
import {
    describeMobile,
    describeSignIn,
    emailStatus,
    factsAreFor,
    formatPhone,
    mobileStatus,
    type ContactFacts,
    type ContactFactsResult,
    type OtherNumber,
    type SeenNumberSource,
} from "@/lib/crm/contact-status";

function formatSGD(amount: number): string {
    return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(amount);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="space-y-0.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm">{children}</dd>
        </div>
    );
}

/**
 * The Contact details card (PRD-customer-page-journey slice 01; it was the
 * Contact and sign-in card of CRM slice 11, ADR 0028 (j)): the customer's
 * email and mobile, each with what is known about it and the buttons that
 * reach them. Every fact is derived, none typed by Staff.
 *
 * Email and the mobile's validity come from the Customer row, so they follow
 * an edit at once. WhatsApp and the other numbers seen are matched by phone on
 * the server (`contact`, lib/crm/contact-facts.ts) for the number on file when
 * the page was read.
 *
 * The buttons are handed in (`emailActions`, `mobileActions`), so the card
 * itself only reads and renders on the server in tests. How they sign in is
 * its own rail row (`SignInFacts`).
 */
export function ContactCard({
    customer,
    createdByImport,
    contact,
    headerAction,
    emailActions,
    mobileActions,
    editForm,
    children,
}: {
    customer: Pick<Customer, "email" | "phone" | "auth_user_id" | "account_linked_at">;
    /** The Shopify import created this Customer (`migrated_customers`): where an unverified email came from. */
    createdByImport?: boolean | null;
    /** What the server matched by phone; left out when it was not read. */
    contact?: ContactFactsResult;
    /** Top right of the card: *Edit*, for those who may. */
    headerAction?: ReactNode;
    /** Under the email: Email, Copy. */
    emailActions?: ReactNode;
    /** Under the mobile: WhatsApp, Call, Copy. */
    mobileActions?: ReactNode;
    /** Shown in place of the rows while the details are being edited. */
    editForm?: ReactNode;
    /** Under the rows: the tags. */
    children?: ReactNode;
}) {
    const signedUp = customer.auth_user_id != null;
    const email = emailStatus({
        hasAccount: signedUp,
        accountLinkedAt: customer.account_linked_at,
        createdByImport,
    });
    const phone = customer.phone?.trim() || null;
    const mobile = mobileStatus(phone);
    const stale = contact?.ok === true && !factsAreFor(contact.facts, phone);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Contact className="h-4 w-4" />
                    Contact details
                </CardTitle>
                {headerAction}
            </CardHeader>
            <CardContent>
                {editForm ?? (
                    <dl className="space-y-4">
                        <Row label="Email">
                            <span className="break-all font-medium">{customer.email}</span>
                            {email.verified ? (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    Verified: signed in with it since {formatAdminDateMY(email.since)}
                                    <InfoTip label="About the sign-up date">
                                        <p>
                                            The day this Customer&apos;s login was bound to their record. A login is
                                            only ever bound by the email they signed in with, so the address is theirs.
                                        </p>
                                        <p>
                                            For an account made before 20 Oct 2026 it is the day the login was
                                            created, the closest record there is.
                                        </p>
                                    </InfoTip>
                                </span>
                            ) : (
                                <span className="block text-xs text-muted-foreground">
                                    Not verified:{" "}
                                    {email.source === "shopify-import" ? "from the Shopify import" : "from checkout"}
                                </span>
                            )}
                            {emailActions ? <span className="mt-2 flex flex-wrap gap-2">{emailActions}</span> : null}
                        </Row>

                        <Row label="Mobile">
                            {phone ? (
                                <>
                                    <span className="break-all font-medium">{formatPhone(phone)}</span>
                                    <span
                                        className={
                                            mobile === "invalid"
                                                ? "block text-xs text-amber-700 dark:text-amber-400"
                                                : "block text-xs text-muted-foreground"
                                        }
                                    >
                                        {describeMobile(phone)}
                                    </span>
                                </>
                            ) : (
                                <span className="text-muted-foreground">{describeMobile(phone)}</span>
                            )}
                            {phone && contact ? (
                                <span className="block text-xs">
                                    {!contact.ok ? (
                                        <span className="text-muted-foreground">Could not check WhatsApp.</span>
                                    ) : stale ? (
                                        <span className="text-muted-foreground">
                                            Reload the page to check WhatsApp for this number.
                                        </span>
                                    ) : (
                                        <WhatsAppFacts whatsapp={contact.facts.whatsapp} />
                                    )}
                                </span>
                            ) : null}
                            {phone && mobileActions ? <span className="mt-2 flex flex-wrap gap-2">{mobileActions}</span> : null}
                        </Row>

                        {contact?.ok && !stale && contact.facts.otherNumbers && (
                            <Row label="Other numbers seen">
                                <OtherNumbers numbers={contact.facts.otherNumbers} />
                            </Row>
                        )}
                        {children}
                    </dl>
                )}
            </CardContent>
        </Card>
    );
}

/** One line for the Sign-in row while it is closed: how they sign in, or that they have no account. */
export function signInSummary(customer: Pick<Customer, "auth_user_id" | "account_providers">): string {
    if (customer.auth_user_id == null) return "No account yet";
    return describeSignIn(customer.account_providers) ?? "Not recorded yet";
}

/**
 * How the Customer signs in, and when they last did (CRM slice 11): the
 * Sign-in rail row. It held the same two lines on the Contact and sign-in
 * card.
 */
export function SignInFacts({
    customer,
}: {
    customer: Pick<Customer, "email" | "auth_user_id" | "account_last_seen_at" | "account_providers">;
}) {
    const signedUp = customer.auth_user_id != null;
    const signIn = describeSignIn(customer.account_providers);
    return (
        <dl className="space-y-3">
            <Row label="Signs in with">
                {!signedUp ? (
                    <span className="text-muted-foreground">
                        No account yet: they become a signed-up customer the first time they sign in
                        with <span className="break-all text-foreground">{customer.email}</span>.
                    </span>
                ) : signIn ? (
                    signIn
                ) : (
                    <span className="text-muted-foreground">
                        Not recorded yet: shown after their next signed-in visit
                    </span>
                )}
            </Row>

            {signedUp && (
                <Row label="Last signed-in visit">
                    <span className="inline-flex items-center gap-1">
                        {customer.account_last_seen_at
                            ? formatAdminDateTimeMY(customer.account_last_seen_at)
                            : <span className="text-muted-foreground">None recorded yet</span>}
                        <InfoTip label="About the last signed-in visit">
                            <p>
                                The last time they opened one of their account pages while signed in,
                                to the hour. Browsing the shop without opening their account does not
                                count, so it is not their last visit to the site.
                            </p>
                            <p>Recorded from 20 Oct 2026.</p>
                        </InfoTip>
                    </span>
                </Row>
            )}
        </dl>
    );
}

function WhatsAppFacts({ whatsapp }: { whatsapp: ContactFacts["whatsapp"] }) {
    return (
        <>
            <span className="inline-flex items-center gap-1">
                {whatsapp.messagedAt ? (
                    <>Messaged us on WhatsApp on {formatAdminDateMY(whatsapp.messagedAt)}</>
                ) : (
                    <span className="text-muted-foreground">No WhatsApp message yet</span>
                )}
                <InfoTip label="About WhatsApp">
                    <p>
                        Any message from this number to our WhatsApp counts, whatever it said: a person typed it
                        on that number. It is matched to the number on file the way appointment reminders match
                        a guest.
                    </p>
                    <p>Recorded from 20 Oct 2026, so a reply before then is not known.</p>
                </InfoTip>
            </span>
            {whatsapp.failedAt && (
                <span className="block text-xs text-amber-700 dark:text-amber-400">
                    Our last WhatsApp to this number failed on {formatAdminDateMY(whatsapp.failedAt)}
                </span>
            )}
        </>
    );
}

const SOURCE_LABEL: Record<SeenNumberSource, string> = { booking: "booking", result: "Result" };

/** Numbers from their bookings and Results that are not the one on file. */
function OtherNumbers({ numbers }: { numbers: OtherNumber[] }) {
    if (numbers.length === 0) return <span className="text-muted-foreground">None</span>;
    return (
        <>
            <ul className="space-y-1">
                {numbers.map((n) => (
                    <li key={n.phone}>
                        <span className="break-all">{n.phone}</span>{" "}
                        <span className="text-xs text-muted-foreground">
                            · {n.sources.map((s) => SOURCE_LABEL[s]).join(", ")} · {formatAdminDateMY(n.lastSeenAt)}
                        </span>
                    </li>
                ))}
            </ul>
            <span className="block text-xs text-muted-foreground">
                Given on their bookings or Results; ask which is current.
            </span>
        </>
    );
}

/**
 * The From Shopify facts (migration slice 12), only for a Migrated customer:
 * the Shopify-era facts kept beside the Customer in `migrated_customers`
 * (ADR 0029 (d)). Shopify orders stay unlinked, so their count and spend are
 * shown apart from the platform's.
 *
 * On the Journey they sit inside the chapter that holds the import
 * (PRD-customer-page-journey slice 04), so `bare` leaves the card off: a
 * heading and the facts, in a box.
 */
export function FromShopifyCard({
    migration,
    importHistoryHref,
    bare = false,
}: {
    migration: MigratedCustomerResult | undefined;
    /** The import history, for a viewer who holds `customer-import`; null otherwise. */
    importHistoryHref: string | null;
    /** Inside a Journey chapter: no card around it. */
    bare?: boolean;
}) {
    if (!migration) return null;
    if (!migration.ok) {
        const text = "Could not load what the Shopify import holds for this Customer.";
        return bare ? (
            <p className="text-sm text-muted-foreground">{text}</p>
        ) : (
            <Card>
                <CardContent className="py-4 text-sm text-muted-foreground">{text}</CardContent>
            </Card>
        );
    }
    if (!migration.facts) return null;
    if (bare) {
        return (
            <section aria-label="From Shopify" className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <ShoppingBag className="h-4 w-4" />
                    From Shopify
                </p>
                <FromShopifyFacts facts={migration.facts} importHistoryHref={importHistoryHref} columns />
            </section>
        );
    }
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4" />
                    From Shopify
                </CardTitle>
            </CardHeader>
            <CardContent>
                <FromShopifyFacts facts={migration.facts} importHistoryHref={importHistoryHref} />
            </CardContent>
        </Card>
    );
}

function FromShopifyFacts({
    facts,
    importHistoryHref,
    columns = false,
}: {
    facts: MigratedCustomerFacts;
    importHistoryHref: string | null;
    /** Two columns where there is room, for the Journey's wider chapter. */
    columns?: boolean;
}) {
    const batch = facts.batch;
    const batchLabel = batch?.fileName ? batch.fileName : "the import";
    return (
                <dl className={columns ? "grid gap-x-6 gap-y-3 @md:grid-cols-2" : "space-y-3"}>
                    <Row label="Imported">
                        {formatAdminDateMY(facts.importedAt)}, from{" "}
                        {importHistoryHref && batch ? (
                            <Link
                                href={`${importHistoryHref}#batch-${batch.id}`}
                                className="break-all text-primary hover:underline active:opacity-60"
                            >
                                {batchLabel}
                            </Link>
                        ) : (
                            <span className="break-all">{batchLabel}</span>
                        )}
                        {batch?.rolledBackAt && (
                            <span className="block text-xs text-muted-foreground">
                                That import was undone on {formatAdminDateMY(batch.rolledBackAt)}. This
                                Customer was kept because they had signed up or bought since.
                            </span>
                        )}
                    </Row>
                    <Row label="Match">
                        {facts.createdByImport
                            ? "Created by the import"
                            : "Matched to an existing Customer"}
                    </Row>
                    <Row label="Orders and spend on Shopify">
                        {facts.shopifyOrdersCount} order{facts.shopifyOrdersCount === 1 ? "" : "s"} ·{" "}
                        {formatSGD(facts.shopifyAmountSpent)}
                        <span className="block text-xs text-muted-foreground">
                            On Shopify, not linked to this account
                        </span>
                    </Row>
                    <Row label="Shopify tags">
                        {facts.shopifyTags.length > 0 ? (
                            <span className="flex flex-wrap gap-1">
                                {facts.shopifyTags.map((tag) => (
                                    <Badge key={tag} variant="outline" className="text-xs font-normal">
                                        {tag}
                                    </Badge>
                                ))}
                            </span>
                        ) : (
                            <span className="text-muted-foreground">None</span>
                        )}
                    </Row>
                    <Row label="Shopify note">
                        {facts.shopifyNote ? (
                            <span className="whitespace-pre-wrap break-words">{facts.shopifyNote}</span>
                        ) : (
                            <span className="text-muted-foreground">None</span>
                        )}
                    </Row>
                    <Row label="Email marketing at export">
                        {facts.emailMarketingAtExport === "yes" ? "Accepted" : "Not accepted"}
                        <span className="block text-xs text-muted-foreground">
                            As the Shopify export of {formatAdminDateMY(facts.exportedAt)} recorded it
                        </span>
                    </Row>
                    <Row label="Claim link">
                        {facts.claimLinkFirstClickedAt ? (
                            <>First opened {formatAdminDateTimeMY(facts.claimLinkFirstClickedAt)}</>
                        ) : (
                            <span className="text-muted-foreground">Not opened</span>
                        )}
                    </Row>
                    {facts.claimedAt && (
                        <Row label="Claim">Claimed on {formatAdminDateMY(facts.claimedAt)}</Row>
                    )}
                    {/* PRD-loyalty-points: the bonus a Claim in its window adds; the Points card has the balance. */}
                    {facts.claimBonusAt && (
                        <Row label="Claim bonus">Granted on {formatAdminDateMY(facts.claimBonusAt)}</Row>
                    )}
                </dl>
    );
}
