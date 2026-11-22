export type ClaimRule = { readonly name: string; readonly pattern: RegExp };

const HEALTH_NOUN =
  "(?:neck|back|shoulders?|pain|aches?|symptoms?|conditions?|injur\\w*|insomnia|sleep apno?ea|apno?ea|disorders?|headaches?|migraines?|spondylosis|stiffness)";

export const CLAIM_RULES: readonly ClaimRule[] = [
  {
    name: "relieve / relief / alleviate (pain relief is a medical purpose, HSA GL-06)",
    pattern: /\breliev(?:e|es|ed|ing)\b|\brelief\b|\balleviat\w*/i,
  },
  { name: "pain-free", pattern: /\bpain[- ]free\b/i },
  {
    name: "reduces or eases pain",
    pattern: /\b(?:reduc(?:e|es|ed|ing)|eas(?:e|es|ed|ing)|lessen\w*|minimi[sz]\w*)\b(?:\W+\w+){0,4}?\W+(?:pain|aches?|discomfort)\b|\bpain reduction\b/i,
  },
  { name: "treat", pattern: new RegExp(`\\btreat(?:s|ed|ing)?\\b(?:\\W+\\w+){0,3}?\\W+${HEALTH_NOUN}\\b|\\btreatments?\\b`, "i") },
  { name: "cure", pattern: /\bcur(?:e|es|ed|ing)\b/i },
  { name: "heal", pattern: /\bheal(?:s|ed|ing)?\b/i },
  { name: "fixes the neck", pattern: /\bfix(?:es)? (?:your |the )?neck\b/i },
  {
    name: "corrects posture or spine",
    pattern:
      /\bcorrect(?:s|ed|ing)? (?:your|the|bad|poor|its) (?:\w+ )?(?:posture|spine|alignment)\b|\bposture correct(?:ion|or)s?\b|\bcorrected posture\b|\brealign(?:s|ing)? (?:your |the )?spine\b/i,
  },
  { name: "rehab", pattern: /\brehab(?:ilitat\w*)?\b/i },
  { name: "prescribe", pattern: /\bprescri(?:be|bes|bed|bing|ption)\b/i },
  { name: "orthopaedic", pattern: /\borthopa?edic\b/i },
  { name: "clinically proven", pattern: /\bclinically[- ](?:proven|tested|shown)\b/i },
  {
    name: "professional endorsement",
    pattern:
      /\b(?:doctors?|physio(?:therapist)?s?|chiropractors?)[- ](?:recommended|approved)\b|\brecommended by (?:a |an |our |your )?(?:doctors?|physio\w*|chiropractors?|specialists?)/i,
  },
  { name: "guaranteed", pattern: /\bguarantee(?:d|s)?\b/i },
  { name: "breathing", pattern: /\bbetter breathing\b|\bbreathe? (?:better|easier|easily)\b|\bairways?\b/i },
  {
    name: "a pillow named for pain",
    pattern: /\bpain pillows?\b|\b(?:our|this) (?:[\w&-]+ ){0,3}pillows? for (?:[\w-]+ ){0,3}pain\b/i,
  },
  { name: "Science of Sleep (retired)", pattern: /science of sleep/i },
  {
    name: "zh: relieve, treat, cure, correct, rehab, endorse, guarantee, breathing or reduces pain",
    pattern:
      /缓解|(?<!物理)治疗|治愈|疗效|矫正|止痛|无痛|康复|处方|骨科枕|临床证明|临床验证|医生推荐|保证|顺畅的?呼吸|呼吸更|更易呼吸|呼吸顺畅|(?:减轻|减少|改善|舒缓|消除|解决)[^。，,；;]{0,8}(?:疼痛|不适|酸痛|痛)/,
  },
];

const MEDICAL_CONDITION =
  /\bpain\b|\baches?\b|surgery|scoliosis|reflux|apno?ea|\bnumb\b|spondyl|arthritis|herniat|slipped disc|insomnia|migraine|reversed neck|kyphosis|疼痛|颈痛|酸痛|手术|脊柱侧弯|胃酸|呼吸暂停|麻木|反弓|关节炎|椎间盘|失眠|偏头痛/i;

export function findClaims(text: string): string[] {
  return CLAIM_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.name);
}

export function namesMedicalCondition(text: string): boolean {
  return MEDICAL_CONDITION.test(text);
}
