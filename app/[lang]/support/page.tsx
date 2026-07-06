import { MessageCircleMore } from "lucide-react";
import { SupportContactForm } from "./support-contact-form";

const WHATSAPP_URL = "https://wa.me/6587805311";

export default async function SupportPage({ params }: { params: Promise<{ lang: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Support</h1>
        <p className="text-muted-foreground leading-relaxed">
          Need help? Chat with us on WhatsApp for the fastest reply, or send us a message below and we&apos;ll get back to you by email.
        </p>
      </div>

      <div className="mt-8 space-y-6">
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50 active:bg-muted/70"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366]">
            <MessageCircleMore className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Chat on WhatsApp</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">+65 8780 5311 · Usually replies within a few hours</span>
          </span>
        </a>

        <SupportContactForm />
      </div>
    </main>
  );
}
