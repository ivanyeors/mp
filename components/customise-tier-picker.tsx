'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { gsap } from 'gsap';
import { ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n/locales';
import { withLocale } from '@/lib/i18n/routing';
import './customise-tier-picker.css';

const MOBILE_QUERY = '(max-width: 899px)';
const ROTATIONS = [-6, 12] as const;

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;
}

type TierId = 'basic' | 'premium';

type TierOption = {
  id: TierId;
  label: string;
  href: string;
  imageSrc: string;
  ariaLabel: string;
  rotation: number;
};

type CustomiseTierPickerProps = {
  locale: Locale;
  images: Record<string, string>;
  basicLabel: string;
  premiumLabel: string;
  triggerLabel: string;
};

export function CustomiseTierPicker({
  locale,
  images,
  basicLabel,
  premiumLabel,
  triggerLabel,
}: CustomiseTierPickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [expandedId, setExpandedId] = useState<TierId | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<(HTMLElement | null)[]>([]);
  const labelRefs = useRef<(HTMLElement | null)[]>([]);

  const tapAgainHint = locale === 'zh-CN' ? '再次点击继续' : 'Tap again to continue';

  const tiers: TierOption[] = [
    {
      id: 'basic',
      label: basicLabel,
      href: withLocale('/mp-basic', locale),
      imageSrc: images.landing_basic_pillow ?? '/basic-mpillow.webp',
      ariaLabel: `${basicLabel} Mpillow`,
      rotation: ROTATIONS[0],
    },
    {
      id: 'premium',
      label: premiumLabel,
      href: withLocale('/mp-config', locale),
      imageSrc: images.landing_premium_pillow ?? '/DarkMpillowImage-WEB.jpg',
      ariaLabel: `${premiumLabel} Mpillow`,
      rotation: ROTATIONS[1],
    },
  ];

  const handleOpen = () => {
    setExpandedId(null);
    setShowOverlay(true);
    setOpen(true);
  };

  const handleClose = useCallback(() => {
    setOpen(false);
    setExpandedId(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleClose]);

  useEffect(() => {
    if (!open) return;

    const scrollY = window.scrollY;
    const { body, documentElement: html } = document;
    const prev = {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      htmlOverflow: html.style.overflow,
    };

    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    html.style.overflow = 'hidden';

    return () => {
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.left = prev.bodyLeft;
      body.style.right = prev.bodyRight;
      body.style.width = prev.bodyWidth;
      html.style.overflow = prev.htmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  useEffect(() => {
    const overlay = overlayRef.current;
    const pills = pillsRef.current.filter(Boolean) as HTMLElement[];
    const labels = labelRefs.current.filter(Boolean) as HTMLElement[];

    if (!overlay || !pills.length) return;

    if (open) {
      gsap.set(overlay, { display: 'flex' });
      gsap.killTweensOf([...pills, ...labels]);
      gsap.set(pills, { scale: 0, transformOrigin: '50% 50%' });
      gsap.set(labels, { y: 24, autoAlpha: 0 });

      pills.forEach((pill, i) => {
        const delay = i * 0.12 + gsap.utils.random(-0.05, 0.05);
        const tl = gsap.timeline({ delay });
        tl.to(pill, { scale: 1, duration: 0.5, ease: 'back.out(1.5)' });
        if (labels[i]) {
          tl.to(
            labels[i],
            { y: 0, autoAlpha: 1, duration: 0.5, ease: 'power3.out' },
            '-=0.45',
          );
        }
      });
    } else if (showOverlay) {
      gsap.killTweensOf([...pills, ...labels]);
      gsap.to(labels, { y: 24, autoAlpha: 0, duration: 0.2, ease: 'power3.in' });
      gsap.to(pills, {
        scale: 0,
        duration: 0.2,
        ease: 'power3.in',
        onComplete: () => {
          gsap.set(overlay, { display: 'none' });
          setShowOverlay(false);
        },
      });
    }
  }, [open, showOverlay]);

  const handlePillClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    tier: TierOption,
  ) => {
    if (!isMobileViewport()) return;

    e.preventDefault();
    if (expandedId === tier.id) {
      handleClose();
      router.push(tier.href);
      return;
    }
    setExpandedId(tier.id);
  };

  // showOverlay only turns true from a click, so the portal never renders on
  // the server or during hydration.
  const overlay =
    showOverlay
      ? createPortal(
          <div
            ref={overlayRef}
            className="tier-picker-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Choose your Mpillow tier"
            aria-hidden={!open}
          >
            <div
              className="tier-picker-backdrop"
              onClick={handleClose}
              aria-hidden="true"
            />
            <ul className="tier-pill-list">
              {tiers.map((tier, idx) => {
                const isExpanded = expandedId === tier.id;
                return (
                  <li key={tier.id} className="tier-pill-col" role="none">
                    <div
                      className="tier-pill-wrap"
                      ref={(el) => {
                        if (el) pillsRef.current[idx] = el;
                      }}
                    >
                      <Link
                        href={tier.href}
                        className={`tier-pill${isExpanded ? ' is-expanded' : ''}`}
                        style={{ '--item-rot': `${tier.rotation}deg` } as React.CSSProperties}
                        aria-label={tier.ariaLabel}
                        aria-pressed={isExpanded}
                        onClick={(e) => handlePillClick(e, tier)}
                      >
                        <Image
                          src={tier.imageSrc}
                          alt=""
                          fill
                          className="tier-pill-image"
                          sizes="(min-width: 900px) 640px, 90vw"
                        />
                        <div className="tier-pill-scrim" aria-hidden="true" />
                        <div className="tier-pill-content">
                          <span
                            className="tier-pill-label"
                            ref={(el) => {
                              if (el) labelRefs.current[idx] = el;
                            }}
                          >
                            {tier.label}
                          </span>
                          <span className="tier-pill-hint">{tapAgainHint}</span>
                        </div>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Button
        type="button"
        className="h-auto px-6 py-4 text-base"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={handleOpen}
      >
        <Sparkles className="mr-2 h-5 w-5" />
        {triggerLabel}
        <ChevronRight className="ml-2 h-5 w-5" />
      </Button>
      {overlay}
    </>
  );
}
