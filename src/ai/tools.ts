import * as chrono from 'chrono-node';

/* ---------- text normalization (catches spelling variants) ---------- */
const normalize = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/([a-z])\1{2,}/g, '$1$1') // "doonnnga" -> "doonga", "sooon" -> "soon"
    .replace(/\s+/g, ' ')
    .trim();

/* ---------- pattern sets (yours, kept intact) ---------- */
const modernEnglish = {
  strong: [
    /\bon it\b/i,
    /\bgot it\b/i,
    /\bgotchu\b/i,
    /\bgot you\b/i,
    /\bsay less\b/i,
    /\bbet\b/i,
    /\bconsider it done\b/i,
    /\bwill revert\b/i,
    /\bwill circle back\b/i,
    /\bwill loop (you )?in\b/i,
    /\bwill get back to you\b/i,
    /\bwill (ping|dm|slack|text|hit you up)\b/i,
    /\bsending (it )?(rn|now|over|shortly)\b/i,
    /\bshipping it\b/i,
    /\bpushing (it|the code|the fix)\b/i,
    /\bwrapping (it|this) up\b/i,
    /\bwill sort (it|this) out\b/i,
    /\btaking care of it\b/i,
    /\bhandling it\b/i,
    /\blocked in\b/i,
    /\bwill knock (it|this) out\b/i,
    /\bwill have it (ready|done|up)\b/i,
    /\bwill drop (it|the file|the link)\b/i,
    /\bcooking\b/i,
    // core first-person forms (were missing from modern-only sets)
    /\bi'?ll\b/i,
    /\bi will\b/i,
    /\bi'?m going to\b/i,
    /\bi'?m gonna\b/i,
    /\bi promise\b/i,
    /\bi commit\b/i,
    /\bwill (send|upload|share|deliver|finish|complete|fix|update|review|email)\b/i,
  ],
  soft: [
    /\btrying to (get|wrap|finish|push)\b/i,
    /\blmk\b/i,
    /\bwip\b/i,
    /\balmost there\b/i,
    /\bgetting to it\b/i,
    /\bon my list\b/i,
    /\bwill try\b/i,
  ],
  deadline: [
    /\brn\b/i,
    /\basap\b/i,
    /\beod\b/i,
    /\bcob\b/i,
    /\bin (a bit|a sec|a min|5|10|15|30)\b/i,
    /\bby (lunch|standup|sync|the sync|end of day|end of week|eow)\b/i,
    /\bfirst thing (tomorrow|monday|am)\b/i,
    /\btonight\b/i,
    /\bthis (morning|afternoon|evening|week)\b/i,
    /\bshortly\b/i,
  ],
  negation: [
    /\bno cap but i can'?t\b/i,
    /\bnot gonna lie.{0,15}can'?t\b/i,
    /\bidk if i can\b/i,
    /\bcan'?t rn\b/i,
    /\bmaybe later\b/i,
    /\bno promises\b/i,
  ],
};

const modernHindi = {
  strong: [
    /\bkar deta hoon\b/i,
    /\bkar deta hun\b/i,
    /\bbhej raha hoon\b/i,
    /\bbhej rahi hoon\b/i,
    /\bbhej deta hoon\b/i,
    /\babhi bhejta hoon\b/i,
    /\babhi karta hoon\b/i,
    /\bho jayega\b/i,
    /\bho jaega\b/i,
    /\bhaan kar dunga\b/i,
    /\bdekh leta hoon\b/i,
    /\bdekh lunga\b/i,
    /\bsambhal lunga\b/i,
    /\bsambhal leta hoon\b/i,
    /\bmanage kar lunga\b/i,
    /\bhandle kar lunga\b/i,
    /\bfix kar dunga\b/i,
    /\bupdate kar dunga\b/i,
    /\bsend kar deta hoon\b/i,
    /\bshare kar dunga\b/i,
    /\bpakka bhej dunga\b/i,
    /\btension mat lo\b/i,
    /\btension na\b/i,
    /\bchinta mat karo\b/i,
    /\bmai dekhta hoon\b/i,
    /\bmai dekhti hoon\b/i,
    /\bhojayega bhai\b/i,
    /\bdone kar dunga\b/i,
    /\b(bhej|kar|de|upload kar|complete kar)\s?(dunga|doonga|dungi|doongi)\b/i,
    /\bकर देता हूँ\b/,
    /\bभेज रहा हूँ\b/,
    /\bभेज देता हूँ\b/,
    /\bहो जाएगा\b/,
    /\bसंभाल लूँगा\b/,
    /\bदेख लेता हूँ\b/,
    /\bटेंशन मत लो\b/,
    /\bचिंता मत करो\b/,
    /\bअभी भेजता हूँ\b/,
    /\bअभी करता हूँ\b/,
  ],
  soft: [
    /\btry karta hoon\b/i,
    /\btry karunga\b/i,
    /\bkoshish karunga\b/i,
    /\bकोशिश करूँगा\b/,
    /\bdekhta hoon kya kar sakta hoon\b/i,
    /\blist me hai\b/i,
    /\bbaad me karta hoon\b/i,
  ],
  deadline: [
    /\babhi\b/i,
    /\bअभी\b/,
    /\bthodi der me\b/i,
    /\bथोड़ी देर में\b/,
    /\b2 min me\b/i,
    /\bkuch der me\b/i,
    /\baaj raat tak\b/i,
    /\bआज रात तक\b/,
    /\blunch ke baad\b/i,
    /\bmeeting se pehle\b/i,
    /\bमीटिंग से पहले\b/,
    /\bshaam tak\b/i,
    /\bsubah tak\b/i,
    /\bkal subah\b/i,
    /\bकल सुबह\b/,
    /\b(\d{1,2})\s?baje\b/i,
    /\b(\d{1,2})\s?बजे\b/, // "4 baje"
  ],
  negation: [
    /\bnahi ho payega\b/i,
    /\bनहीं हो पाएगा\b/,
    /\bmushkil hai\b/i,
    /\bpata nahi kar paunga\b/i,
    /\babhi nahi\b/i,
    /\bअभी नहीं\b/,
    /\bbaad me dekhenge\b/i,
  ],
};

const langSets = [modernEnglish, modernHindi];

/* ---------- request / question detection (avoid false positives) ---------- */
const isQuestion = (t: string): boolean =>
  /\?\s*$/.test(t.trim()) ||
  /\b(can|could|will|would) you\b/i.test(t) ||
  /\bplease (send|share|upload|do|finish)\b/i.test(t) ||
  /\b(kya|क्या) .*(karoge|bhejoge|कर(ोगे)?)\b/i.test(t);

// crude third-party check: another subject before the commitment verb
const isThirdParty = (t: string): boolean =>
  /\b(he|she|they|he'?ll|she'?ll|they'?ll|wo|vo|woh)\b/i.test(t) &&
  !/\b(i|i'?ll|i'?m|mai|main|mein)\b/i.test(t);

/* ---------- Hinglish deadline -> real Date (chrono can't do these) ---------- */
const resolveHinglishTime = (t: string, ref = new Date()): Date | null => {
  const d = new Date(ref);
  const baje = t.match(/\b(\d{1,2})\s?(baje|बजे)\b/i);
  if (baje) {
    let hr = parseInt(baje[1], 10);
    if (/shaam|शाम|raat|रात|evening|pm|dopahar/i.test(t) && hr < 12) hr += 12;
    d.setHours(hr, 0, 0, 0);
    return d;
  }
  if (/\b(abhi|अभी|rn)\b/i.test(t)) return d;
  if (/\b(kal subah|कल सुबह)\b/i.test(t)) {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (/\b(shaam tak|शाम तक)\b/i.test(t)) {
    d.setHours(18, 0, 0, 0);
    return d;
  }
  if (/\b(subah tak|सुबह तक)\b/i.test(t)) {
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (/\b(aaj raat tak|आज रात तक|tonight)\b/i.test(t)) {
    d.setHours(22, 0, 0, 0);
    return d;
  }
  return null;
};

/* ---------- main detector ---------- */
export interface CommitmentResult {
  text: string;
  dueTime: Date | null;
  confidence: 'high' | 'medium' | 'low';
  score: number;
  hasDeadline: boolean;
  matched: string[];
}

export const detectCommitment = (
  rawText: string,
  ref: Date = new Date(),
): CommitmentResult | null => {
  const text = normalize(rawText);

  // 1. hard filters
  if (isQuestion(rawText)) return null; // it's a request, not a promise
  if (isThirdParty(rawText)) return null; // someone else's commitment

  for (const lang of langSets) {
    if (lang.negation.some((p) => p.test(text))) return null;
  }

  // 2. score keywords
  let score = 0;
  const matched: string[] = [];
  for (const lang of langSets) {
    for (const p of lang.strong)
      if (p.test(text)) {
        score += 3;
        matched.push(p.source);
      }
    for (const p of lang.soft)
      if (p.test(text)) {
        score += 1.5;
        matched.push(p.source);
      }
  }
  if (score === 0) return null;

  // 3. deadline (regex + chrono + hinglish resolver)
  let hasDeadline = false;
  for (const lang of langSets) {
    if (lang.deadline.some((p) => p.test(text))) {
      hasDeadline = true;
      break;
    }
  }
  const parsed = chrono.parse(rawText, ref);
  const chronoDate = parsed.length > 0 ? parsed[0].start.date() : null;
  const hinglishDate = resolveHinglishTime(text, ref);
  const dueTime = chronoDate ?? hinglishDate;

  if (dueTime || hasDeadline) score += 2;

  // 4. confidence
  const confidence: CommitmentResult['confidence'] =
    score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low';

  return {
    text: rawText,
    dueTime,
    confidence,
    score,
    hasDeadline: hasDeadline || !!dueTime,
    matched,
  };
};
