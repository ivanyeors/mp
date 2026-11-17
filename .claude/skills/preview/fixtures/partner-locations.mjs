// Locations for Settings → Partners, /our-partners and the Partner Hub: own
// studios and partner clinics, one partner with several clinics (ADR 0037:
// branch rows point at the main row with `parent_id`), one with a single
// clinic, one online-only and one hidden. Sign in as the multi-clinic partner
// with `preview shoot --as partner@preview.local /partner/settings`.
// Every name, address and code here is made up.

export const PARTNER = { id: "00000000-0000-4000-8000-000000000003", email: "partner@preview.local" };
// A clinic whose application is still under review, with the listing it sent
// (logo + write-up): `preview shoot --as applicant@preview.local /partner` shows
// the under-review screen, and Settings → Partner applications lists it.
export const APPLICANT = { id: "00000000-0000-4000-8000-000000000004", email: "applicant@preview.local" };

const P = {
  alignwell: "00000000-0000-4000-8000-0000000a0001",
  harbourside: "00000000-0000-4000-8000-0000000a0002",
  tranquil: "00000000-0000-4000-8000-0000000a0003",
  kinetic: "00000000-0000-4000-8000-0000000a0004",
  northpoint: "00000000-0000-4000-8000-0000000a0005",
  studio: "00000000-0000-4000-8000-0000000a0006",
};

export default function partners({ now }) {
  const at = "2026-08-01T02:00:00Z";
  const row = (o) => ({
    logo_url: null,
    media_asset_id: null,
    website_url: null,
    description: null,
    visible: true,
    type: "partner",
    address: null,
    postal_code: null,
    branch_name: null,
    parent_id: null,
    bookable: true,
    referral_code: null,
    created_at: at,
    updated_at: at,
    ...o,
  });
  const branch = (id, parent, position, o) =>
    row({ id, parent_id: parent.id, name: parent.name, visible: false, position, ...o });

  const alignwell = row({
    id: P.alignwell,
    name: "Alignwell Chiropractic",
    website_url: "https://alignwell.example",
    description: "Chiropractic care and posture rehab for desk-bound backs and necks.",
    branch_name: "Novena",
    address: "21 Larkspur Avenue\n#08-12 Larkspur Medical Centre\nSingapore",
    postal_code: "307999",
    position: 1,
    referral_code: "ALIGNWELL",
  });
  const tranquil = row({
    id: P.tranquil,
    name: "Tranquil TCM Wellness",
    website_url: "https://tranquil-tcm.example",
    description: "Tuina, acupuncture and sleep consultations.",
    branch_name: "Chinatown",
    address: "88 Lantern Street\n#02-07\nSingapore",
    postal_code: "058999",
    position: 3,
    referral_code: "TRANQUIL",
  });

  // The fake Supabase serves every public storage object as a grey square.
  const storage = `http://127.0.0.1:${process.env.PREVIEW_SUPABASE_PORT ?? 54329}`;
  const appliedAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

  return {
    users: [
      { ...PARTNER, last_sign_in_at: now.toISOString(), user_metadata: { full_name: "Preview Partner" } },
      { ...APPLICANT, last_sign_in_at: now.toISOString(), user_metadata: { full_name: "Preview Applicant" } },
    ],
    tables: {
      partners: [
        row({
          id: P.studio,
          name: "Mpillow Studio",
          type: "own",
          visible: false,
          address: "5 Fernbrook Road\n#03-01\nSingapore",
          postal_code: "534999",
          position: 0,
        }),
        alignwell,
        branch("00000000-0000-4000-8000-0000000a0101", alignwell, 0, {
          branch_name: "Tampines",
          address: "9 Kestrel Central\n#01-05\nSingapore",
          postal_code: "529999",
        }),
        branch("00000000-0000-4000-8000-0000000a0102", alignwell, 1, {
          branch_name: "Jurong East",
          address: "50 Westgate Link\n#04-21\nSingapore",
          postal_code: "608999",
        }),
        branch("00000000-0000-4000-8000-0000000a0103", alignwell, 2, {
          branch_name: "Bukit Timah",
          address: "301 Hillcrest Road\n#02-18\nSingapore",
          postal_code: "289999",
        }),
        row({
          id: P.harbourside,
          name: "Harbourside Physio",
          website_url: "https://harbourside-physio.example",
          description: "Sports physiotherapy and clinical pilates.",
          address: "1 Quayside Walk\n#02-110\nSingapore",
          postal_code: "098999",
          position: 2,
          referral_code: "HARBOUR",
        }),
        tranquil,
        branch("00000000-0000-4000-8000-0000000a0301", tranquil, 0, {
          branch_name: "Toa Payoh",
          address: "Blk 190 Lorong Willow 6\n#01-552\nSingapore",
          postal_code: "319999",
        }),
        row({
          id: P.kinetic,
          name: "Kinetic Pilates Studio",
          description: "Reformer classes. Refers clients online.",
          position: 4,
          referral_code: "KINETIC",
        }),
        row({
          id: P.northpoint,
          name: "Northpoint Rehab",
          description: "Hidden until Staff publish it.",
          visible: false,
          address: "12 Ashgrove Drive\nSingapore",
          postal_code: "769999",
          position: 5,
        }),
      ],
      partner_users: [
        {
          id: "00000000-0000-4000-8000-0000000b0001",
          auth_user_id: PARTNER.id,
          partner_id: P.alignwell,
          email: PARTNER.email,
          application_status: "approved",
          questionnaire: { companyName: "Alignwell Chiropractic" },
          agreed_version: "2026-07-28",
          agreed_at: at,
          backup_email: null,
          backup_email_verified: false,
          created_at: at,
          updated_at: at,
        },
        {
          id: "00000000-0000-4000-8000-0000000b0002",
          auth_user_id: APPLICANT.id,
          partner_id: null,
          email: APPLICANT.email,
          application_status: "pending",
          questionnaire: {
            companyName: "Meadowbrook Physio & Pilates",
            uen: "202412345K",
            website: "meadowbrook-physio.example",
            category: "physio",
            contactName: "Dana Lim",
            contactMobile: "91234567",
            businessEmail: "hello@meadowbrook-physio.example",
            introPlan: "We'd fit clients after neck and shoulder assessments and keep a demo pillow at the front desk.",
            description:
              "Physiotherapy and clinical pilates for neck, shoulder and back pain, with posture assessments for desk workers.",
            logoUrl: `${storage}/storage/v1/object/public/media/partner-logos/applicants/${APPLICANT.id}/meadowbrook.webp`,
          },
          agreed_version: "2026-07-28",
          agreed_at: appliedAt,
          backup_email: null,
          backup_email_verified: false,
          created_at: appliedAt,
          updated_at: appliedAt,
        },
      ],
    },
  };
}
