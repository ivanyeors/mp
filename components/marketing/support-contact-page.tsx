import type { Metadata } from "next";
import { CalendarDays, MessageCircleMore } from "lucide-react";

import { SupportContactForm } from "@/app/[lang]/support/support-contact-form";
import { BookAppointmentButton } from "@/components/book-appointment-button";
import { InfoCallout } from "@/components/marketing/info-callout";
import { Separator } from "@/components/ui/separator";
import {
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_WHATSAPP_URL,
} from "@/lib/contact";

const QUICK_LINKS = [
  { href: "#book-appointment", label: "Book appointment" },
  { href: "#important", label: "Important" },
  { href: "#contact", label: "Contact" },
] as const;

const IMPORTANT_NOTES = [
  "Each customisation is $50 per person. Additional charges may apply for complex tailoring. For outreach services, there will be a surcharge of $250 per visit (include transport and one hour customisation). For basic pillow adjustment, each session is $30 per individual.",
  "A one-time adjustment is free of charge for premium pillow within 60 days of purchase after which subsequent adjustment will be at $30 per individual.",
  "When applicable, sewing service is $20 for every 15 min.",
  "Wear comfortably for your fitting as you would be able to give the Mpillow a try after taking the measurements.",
  "For bookings outside of Singapore, the customisation will be conducted by video call. We will send you a link once the appointment is confirmed.",
] as const;

type SupportContactPageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateSupportMetadata({ params }: SupportContactPageProps): Promise<Metadata> {
  await params;
  return {
    title: "Contact Us",
    description:
      "Book an appointment, chat on WhatsApp, or send us a message. Learn how to schedule customisation, adjustments, and fitting sessions at Mpillow.",
  };
}

export async function SupportContactPage({ params }: SupportContactPageProps) {
  await params;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Contact Us</h1>
        <p className="leading-relaxed text-muted-foreground">
          Need help? Chat with us on WhatsApp for the fastest reply, book an appointment below, or send
          us a message and we&apos;ll get back to you by email.
        </p>
      </div>

      <nav aria-label="Contact page sections" className="mt-8 flex flex-wrap gap-2">
        {QUICK_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="shrink-0 rounded-full border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            {link.label}
          </a>
        ))}
      </nav>

      <section id="book-appointment" className="mt-10 scroll-mt-24 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-xl font-semibold tracking-tight">How To Book An Appointment</h2>
        </div>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Select your preferred available slot using the button below to open our calendar. One slot is
            only for one person. If you have 2 people, please book 2 adjacent time slots. For
            rescheduling, please WhatsApp to{" "}
            <a href={SUPPORT_WHATSAPP_URL} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">
              {SUPPORT_WHATSAPP_DISPLAY}
            </a>{" "}
            at least 48 hours before appointment in order for other customers to have a chance to take over
            your slot.
          </p>
          <p>You will receive a WhatsApp message from us on the details.</p>
        </div>
        <BookAppointmentButton className="mt-2">Book an appointment</BookAppointmentButton>
      </section>

      <Separator className="my-10" />

      <InfoCallout id="important" title="Important">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          {IMPORTANT_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </InfoCallout>

      <Separator className="my-10" />

      <section id="contact" className="scroll-mt-24 space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">Get in touch</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Prefer to message us directly? Use WhatsApp or the form below.
          </p>
        </div>

        <a
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50 active:bg-muted/70"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366]">
            <MessageCircleMore className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Chat on WhatsApp</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              {SUPPORT_WHATSAPP_DISPLAY} · Usually replies within a few hours
            </span>
          </span>
        </a>

        <SupportContactForm />
      </section>
    </main>
  );
}
