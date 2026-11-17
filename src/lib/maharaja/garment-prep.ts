import { createHash } from 'crypto';
import sharp from 'sharp';
import type { GoogleGenAI } from '@google/genai';
import { getDb } from '@/lib/firebase/admin';
import { AI_CONFIG } from '@/lib/ai/config';
import { type GarmentType, GENLOOK_GARMENT_DESCRIPTIONS, TRY_ON_REGION } from '@/lib/maharaja/config';
import { activeClientId } from '@/lib/maharaja/client-context';

/**
 * Getting a garment photo ready for GenLook, shared by the Try-On route and the catalogue pre-warm: the photo
 * at GenLook's size, the one garment found and cut out, and one exact sentence about it. Every Gemini answer
 * is saved per photo (Firestore), so a garment prepared ahead of time costs a customer no waiting.
 */

/**
 * The photo GenLook gets. GenLook refuses photos it finds too small, and its 2K result wants at least 1600 px
 * on the long side: smaller photos are enlarged to 1600, large ones kept up to 2048. The same source always
 * gives the same bytes, so the saved Gemini answers (keyed by these bytes) are found again.
 */
export async function genlookSourceFrom(sourceBase64: string): Promise<string> {
  const image = sharp(Buffer.from(sourceBase64, 'base64')).rotate();
  const { width = 0, height = 0 } = await image.metadata();
  const longSide = Math.max(width, height);
  const target = longSide < 1600 ? 1600 : Math.min(2048, longSide);
  const buffer = await image.resize(target, target, { fit: 'inside', kernel: 'lanczos3' }).jpeg({ quality: 90, progressive: true }).toBuffer();
  return buffer.toString('base64');
}

/**
 * One exact sentence about the garment in the photo for GenLook's product listing: sleeves, pockets,
 * collar, closure, print and colours. Saved per photo, so a store piece is described only once.
 */
export async function describeGarmentForGenlook(ai: GoogleGenAI | null, garmentBase64: string, garmentType: GarmentType): Promise<string> {
  const fallback = GENLOOK_GARMENT_DESCRIPTIONS[garmentType].description;
  if (!ai) return fallback;
  const hash = `${activeClientId()}-${createHash('sha256').update(garmentBase64).digest('hex').slice(0, 40)}`;
  const db = getDb();
  const cacheRef = db ? db.collection('genlookGarmentDescriptions').doc(hash) : null;
  try {
    // A saved description is reused only for the same garment type (one made under an old, wrong type is redone).
    const saved = cacheRef ? (await cacheRef.get()).data() : undefined;
    const cached = saved?.garmentType === garmentType ? saved?.description : undefined;
    if (typeof cached === 'string' && cached) return cached;
    const response = await ai.models.generateContent({
      model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
      contents: [
        { inlineData: { mimeType: 'image/jpeg', data: garmentBase64 } },
        `This photo shows a ${GENLOOK_GARMENT_DESCRIPTIONS[garmentType].title.toLowerCase()} for a virtual try-on product listing. In one plain sentence of at most 45 words, describe only the garment as it is: garment type, sleeve length, collar or neckline, how many pockets and where, closure, print or pattern, colours, fit and length. Do not mention the background, floor, hanger, person or anything not visible. No marketing words.`,
      ],
      config: { abortSignal: AbortSignal.timeout(8_000) },
    });
    const text = (response.text || '').replace(/\s+/g, ' ').trim();
    if (text.length < 15) return fallback;
    if (cacheRef) await cacheRef.set({ description: text, garmentType, createdAt: new Date().toISOString() }).catch(() => undefined);
    return text;
  } catch {
    return fallback;
  }
}

export type GenlookPiece = { image: string; product: { externalId: string; title: string; description: string } };

/** The garment cut out of its photo (box on a 0-1000 scale, 4% margin), at least 1200 px for GenLook. A box
 * that already fills almost the whole photo leaves it as it is. */
async function cropToPiece(garmentBase64: string, box: number[]): Promise<string> {
  const [ymin, xmin, ymax, xmax] = box.map((n) => Math.min(1000, Math.max(0, n)));
  if ((ymax - ymin) * (xmax - xmin) > 0.85 * 1000 * 1000) return garmentBase64;
  const source = Buffer.from(garmentBase64, 'base64');
  const { width = 0, height = 0 } = await sharp(source).metadata();
  if (!width || !height) return garmentBase64;
  const padX = (xmax - xmin) * 0.04;
  const padY = (ymax - ymin) * 0.04;
  const left = Math.max(0, Math.floor(((xmin - padX) / 1000) * width));
  const top = Math.max(0, Math.floor(((ymin - padY) / 1000) * height));
  const cropWidth = Math.min(width - left, Math.ceil(((xmax - xmin + padX * 2) / 1000) * width));
  const cropHeight = Math.min(height - top, Math.ceil(((ymax - ymin + padY * 2) / 1000) * height));
  if (cropWidth < 64 || cropHeight < 64) return garmentBase64;
  const crop = await sharp(source).extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(1200, 1200, { fit: 'inside', kernel: 'lanczos3' }).jpeg({ quality: 90 }).toBuffer();
  return crop.toString('base64');
}

/**
 * GenLook products for one outfit photo. A set laid out piece by piece (a shirt beside a veshti) is found by
 * Gemini, each piece cut out with its own exact description; one garment (or an on-model photo) stays one
 * product. Anything unexpected falls back to one product with one description. Saved per photo.
 */
/**
 * A store photo often shows a whole outfit (a model in a green shirt and a veshti) while the piece sold
 * replaces only a top or only a bottom. Finds just that one garment, even when worn with others, so no
 * engine copies the rest of the outfit onto the customer. Null when it is not clearly visible.
 */
async function findTargetGarment(ai: GoogleGenAI, garmentBase64: string, garmentType: GarmentType, region: 'upper' | 'lower'): Promise<{ box: number[]; description: string } | null> {
  const hash = `${activeClientId()}-target-v1-${garmentType}-${createHash('sha256').update(garmentBase64).digest('hex').slice(0, 40)}`;
  const db = getDb();
  const cacheRef = db ? db.collection('genlookGarmentPieces').doc(hash) : null;
  const saved = cacheRef ? (await cacheRef.get()).data() : undefined;
  if (saved && 'target' in saved) return (saved.target as { box: number[]; description: string } | null) ?? null;
  const noun = GENLOOK_GARMENT_DESCRIPTIONS[garmentType].title.toLowerCase();
  const where = region === 'upper' ? 'the upper-body garment, from the shoulders to its own hem' : 'the lower-body garment, from the waist to its own hem';
  const response = await ai.models.generateContent({
    model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
    contents: [
      { inlineData: { mimeType: 'image/jpeg', data: garmentBase64 } },
      `This is a store's product photo for a virtual try-on of one garment: a ${noun}. It may show only that garment, or a model wearing it together with other clothes. Find only the ${noun}: ${where}. Never include any other garment worn with it, the model's skin beyond what the garment covers, or the background. Return JSON {"found":true,"box":[ymin,xmin,ymax,xmax],"description":"..."} with the box on a 0-1000 scale tightly around that one garment, or {"found":false} if it is not clearly visible. The description is one plain sentence of at most 40 words: main body colour first, where any print, border or pattern sits, and for a top its sleeves, collar, pockets and closure.`,
    ],
    config: { responseMimeType: 'application/json', abortSignal: AbortSignal.timeout(12_000) },
  });
  const parsed = JSON.parse(response.text || '{}');
  const box = Array.isArray(parsed?.box) ? parsed.box.map(Number) : [];
  const valid = parsed?.found === true && box.length === 4 && box.every((n: number) => Number.isFinite(n))
    && box[2] - box[0] > 80 && box[3] - box[1] > 80 && typeof parsed.description === 'string';
  const target = valid ? { box, description: String(parsed.description) } : null;
  if (cacheRef) await cacheRef.set({ target, garmentType, createdAt: new Date().toISOString() }).catch(() => undefined);
  return target;
}

export async function prepareGenlookPieces(ai: GoogleGenAI | null, garmentBase64: string, garmentType: GarmentType, base: { externalId: string; title: string }, ownOutfit = false): Promise<GenlookPiece[]> {
  const single = async () => [{ image: garmentBase64, product: { ...base, description: (await describeGarmentForGenlook(ai, garmentBase64, garmentType)).slice(0, 500) } }];
  if (!ai) return single();
  // A store piece that replaces only a top or only a bottom: cut that one garment out of its photo, and
  // name it by what it is, so a set's title ("Green Shirt and Veshti") never makes GenLook dress both.
  const region = TRY_ON_REGION[garmentType];
  if (!ownOutfit && region !== 'full') {
    try {
      const target = await findTargetGarment(ai, garmentBase64, garmentType, region);
      if (target) {
        // Cut the piece out only when it fills a good part of the photo. A small box (a wrong guess, or a
        // garment that is already alone in a flat-lay) would hand GenLook a scrap and it would invent the
        // rest; the whole photo with the exact description is the safer input then.
        const [ymin, xmin, ymax, xmax] = target.box;
        const share = ((ymax - ymin) * (xmax - xmin)) / (1000 * 1000);
        const image = share >= 0.3 ? await cropToPiece(garmentBase64, target.box) : garmentBase64;
        return [{ image, product: { externalId: base.externalId, title: GENLOOK_GARMENT_DESCRIPTIONS[garmentType].title, description: target.description.slice(0, 500) } }];
      }
    } catch {
      // Fall through to the whole photo; the prompt's scope still keeps the customer's other clothes.
    }
  }
  const hash = `${activeClientId()}-${createHash('sha256').update(garmentBase64).digest('hex').slice(0, 40)}`;
  const db = getDb();
  const cacheRef = db ? db.collection('genlookGarmentPieces').doc(hash) : null;
  try {
    type Found = { name: string; box: number[]; description: string };
    const savedPieces = cacheRef ? (await cacheRef.get()).data() : undefined;
    let found: Found[] | undefined = savedPieces?.garmentType === garmentType ? savedPieces?.pieces : undefined;
    if (!found) {
      const response = await ai.models.generateContent({
        model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
        contents: [
          { inlineData: { mimeType: 'image/jpeg', data: garmentBase64 } },
          `This is a product photo of a ${GENLOOK_GARMENT_DESCRIPTIONS[garmentType].title.toLowerCase()} for a virtual try-on. Find each separate garment piece shown (for example a shirt and a veshti laid side by side). Ignore labels, props, lamps, leaves, and any cloth that is only background decoration. If a person is holding the garment up in front of them, return only the held garment, never the person, their own clothes or hands. If it is one garment, or a person wearing the outfit, return one piece. Return JSON: {"pieces":[{"name":"shirt","box":[ymin,xmin,ymax,xmax],"description":"..."}]} with the box on a 0-1000 scale around the whole piece. Each description is one plain sentence of at most 40 words: the main body colour first, then where any print or pattern sits (all over, or only on a border, strip or band), and for a top its sleeves, collar, pockets and closure. Never give one piece the print of another.`,
        ],
        config: { responseMimeType: 'application/json', abortSignal: AbortSignal.timeout(12_000) },
      });
      const parsed = JSON.parse(response.text || '{}');
      found = Array.isArray(parsed?.pieces) ? parsed.pieces : [];
      if (cacheRef) await cacheRef.set({ pieces: found, garmentType, createdAt: new Date().toISOString() }).catch(() => undefined);
    }
    const valid = (found || []).filter((piece) => Array.isArray(piece.box) && piece.box.length === 4 && piece.box.every((n) => Number.isFinite(n))
      && piece.box[2] - piece.box[0] > 80 && piece.box[3] - piece.box[1] > 80 && typeof piece.description === 'string').slice(0, 3);
    // A store's catalogue photo is always one product, even if it shows a set: described as a whole.
    if (valid.length >= 2 && !ownOutfit) return single();
    if (valid.length < 2) {
      // One garment: a customer's own outfit is named by what it is (kurta, saree...), not the category tapped.
      const detected = String(valid[0]?.name || '').trim();
      const title = ownOutfit && detected ? detected.charAt(0).toUpperCase() + detected.slice(1, 60) : base.title;
      // A customer's own garment held up in the hand (or with room around it) is cut out first, so the
      // engines see only the garment, not the person, hands or room holding it.
      const image = ownOutfit && valid[0] ? await cropToPiece(garmentBase64, valid[0].box) : garmentBase64;
      return [{ image, product: { ...base, title, description: (valid[0]?.description || (await describeGarmentForGenlook(ai, garmentBase64, garmentType))).slice(0, 500) } }];
    }
    return await Promise.all(valid.map(async (piece, index) => {
      const crop = await cropToPiece(garmentBase64, piece.box);
      const name = String(piece.name || `piece ${index + 1}`).slice(0, 40);
      return {
        image: crop,
        product: { externalId: `${base.externalId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, title: name.charAt(0).toUpperCase() + name.slice(1), description: piece.description.slice(0, 500) },
      };
    }));
  } catch {
    return single();
  }
}
