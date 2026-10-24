import 'server-only';

import { getDb, getSignedPlaybackUrl } from '@/lib/firebase/admin';
import { MAHARAJA_CLIENT_ID } from './config';
import type { MaharajaCatalogueProduct, PublicCatalogueProduct } from './catalogue-types';

const collectionPath = `clientWorkspaces/${MAHARAJA_CLIENT_ID}/catalogueProducts`;

// The first Maharaja catalogue was uploaded directly to the Storage root from
// Firebase Console. Keep this inventory in code so it is usable immediately;
// Firestore records, when present, remain the source of truth for future edits.
const ROOT_SILK_CATALOGUE = ([
  ['8IC53071', 'Kanchivaram Deep Purple Silk Saree with Peacock and Floral Brocade', 37000, '01_kanchivaram_deep_purple_silk_saree_with_all_over_peacock_flo.jpg'],
  ['8IC53074', 'Kanchivaram Gold Yellow Silk Saree with Bird Border', 37900, '02_kanchivaram_gold_yellow_silk_saree_with_all_over_daimond_bro.jpg'],
  ['8IC53072', 'Kanchivaram Black Geometrical Silk Saree with Silver Zari Border', 26000, '03_kanchivaram_black_geometrical_silk_saree_with_silver_zari_bo.jpg'],
  ['8IC53069', 'Kanchivaram Crimson Red Silk Saree with Bird and Floral Motifs', 34000, '04_kanchivaram_crimson_red_silk_saree_with_bird_floral_motifs.jpg'],
  ['8IC29', 'Kanchivaram Traditional Tissue Gold Silk Saree with Floral Zari Border', 34500, '05_kanchivaram_traditional_tissue_gold_silk_saree_with_floral_z.jpg'],
  ['8IC6', 'Kanchivaram Dark Green Checked Silk Saree with Elephant and Horse Motifs', 17500, '06_kanchivaram_dark_green_checked_silk_saree_with_elephant_hors.jpg'],
  ['8IC54160', 'Kanchivaram Orange Silk Saree with Peacock Border', 19900, '07_kanchivaram_orange_silk_saree_with_peacock_border.jpg'],
  ['8IC3', 'Kanchivaram Striped Mangalya Silk Saree', 16900, '08_kanchivaram_striped_mangalya_silk_saree.jpg'],
  ['8IC275', 'Kanchivaram Purple Silk Saree with Ganga Jamuna Border', 18900, '09_kanchivaram_purple_silk_saree_with_ganga_jamuna_border.jpg'],
  ['8IC402', 'Kanchivaram Traditional Black Silk Saree with Lotus and Peacock Border', 18950, '10_kanchivaram_traditional_black_silk_saree_with_lotus_peacock_.jpg'],
  ['8IC189', 'Kanchivaram Brown Silk Saree with Multi Colour Checks Border', 27000, '11_kanchivaram_brown_silk_saree_with_multi_colour_checks_border.jpg'],
  ['8IC38', 'Kanchivaram Dark Brown Checked Silk Saree with Peacock and Elephant Motifs', 24500, '12_kanchivaram_dark_brown_checked_silk_saree_with_peacock_eleph.jpg'],
  ['8IC193', 'Kanchivaram Violet Silk Saree with Peacock Motif and Turning Border', 29500, '13_kanchivaram_violet_silk_saree_with_peacock_motif_turning_bor.jpg'],
  ['8IC54126', 'Kanchivaram Ivory Gold Checked Silk Saree', 19700, '14_kanchivaram_ivory_gold_checked_silk_saree.jpg'],
  ['8IC406', 'Kanchivaram Coffee Brown Silk Saree with Green Checked Body', 19600, '15_kanchivaram_coffee_brown_silk_saree_with_green_checked_body.jpg'],
  ['8IC405', 'Kanchivaram Black Silk Saree with Checked Body', 19600, '16_kanchivaram_black_silk_saree_with_checked_body.jpg'],
  ['8IC404', 'Kanchivaram Dark Green Silk Saree with Purple Checked Body', 19600, '17_kanchivaram_dark_green_silk_saree_with_purple_checked_body.jpg'],
  ['8IC262', 'Kanchivaram Royal Magenta Silk Saree', 19000, '18_kanchivaram_royal_magenta_silk_saree.jpg'],
  ['8IC260', 'Kanchivaram Coffee Brown Silk Saree with Micro Checked Border', 19000, '19_kanchivaram_coffee_brown_silk_saree_with_micro_checked_borde.jpg'],
  ['8IC30', 'Kanchivaram Black and Gold Striped Saree with Traditional Motifs', 21500, '20_kanchivaram_black_gold_striped_saree_with_traditional_motifs.jpg'],
  ['8IC12', 'Kanchivaram Sand Gold Silk Saree with Traditional Human Motif Border', 22500, '21_kanchivaram_sand_gold_silk_saree_with_traditional_human_moti.jpg'],
  ['8IC273', 'Kanchivaram Deep Violet Silk Saree with Traditional Border', 18900, '22_kanchivaram_deep_violet_silk_saree_with_traditional_border.jpg'],
  ['8IC21', 'Kanchivaram Dual Tone Checked Silk Saree with Traditional Zari Border', 26000, '23_kanchivaram_dual_tone_checked_silk_saree_with_traditional_za.jpg'],
  ['8IC416', 'Kanchivaram Multi Colour Checks Silk Saree with Vintage Border', 27900, '24_kanchivaram_multi_colour_checks_silk_saree_with_vintage_bord.jpg'],
  ['8IC4', 'Kanchivaram Bronze Checks Saree with Black Border', 16500, '25_kanchivaram_bronze_checks_saree_with_black_border.jpg'],
] as Array<[string, string, number, string]>).map(([sku, title, price, storagePath], index): MaharajaCatalogueProduct => ({ sku, title, price, storagePath, productUrl: '', active: true, sortOrder: index + 1 }));

export async function listCatalogueProducts(): Promise<PublicCatalogueProduct[]> {
  const db = getDb();
  const snapshot = db ? await db.collection(collectionPath).where('active', '==', true).get() : null;
  const products = (snapshot && !snapshot.empty
    ? snapshot.docs.map((doc) => doc.data() as MaharajaCatalogueProduct)
    : ROOT_SILK_CATALOGUE).sort((left, right) => left.sortOrder - right.sortOrder);
  return Promise.all(products.map(async ({ storagePath: _storagePath, ...product }) => ({
    ...product,
    imageUrl: await getSignedPlaybackUrl(_storagePath),
  })));
}

export async function getCatalogueProduct(sku: string): Promise<MaharajaCatalogueProduct | null> {
  const db = getDb();
  if (!sku) return null;
  if (!db) return ROOT_SILK_CATALOGUE.find((product) => product.sku === sku) || null;
  const snapshot = await db.collection(collectionPath).doc(sku).get();
  if (snapshot.exists) {
    const product = snapshot.data() as MaharajaCatalogueProduct;
    return product.active ? product : null;
  }
  return ROOT_SILK_CATALOGUE.find((product) => product.sku === sku) || null;
}
