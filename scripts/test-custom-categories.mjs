import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);

const {
  allCategoriesFor,
  categoriesFor,
  sanitizeCategoryLists,
  sanitizeCustomCategories,
  findCategory,
  isCustomCategoryId,
} = await import('../src/lib/tryfocus/store-categories.ts');

// A store can define its own category with a garment type Try-On knows how to render.
const customs = sanitizeCustomCategories([
  { id: 'custom-jumpsuits-abc123', label: 'Jumpsuits', gender: 'women', garmentType: 'one_piece', westernTryOnEligible: true },
]);
assert.ok(customs, 'well-formed custom category should sanitize');
assert.equal(customs.length, 1);
assert.equal(customs[0].label, 'Jumpsuits');

// A custom category with a bad garment type, missing name, wrong gender, or colliding with a master id is rejected.
assert.equal(sanitizeCustomCategories([{ id: 'custom-x-1', label: '', gender: 'women', garmentType: 'one_piece' }]), null, 'empty label rejected');
assert.equal(sanitizeCustomCategories([{ id: 'custom-x-1', label: 'X', gender: 'women', garmentType: 'not-a-type' }]), null, 'bad garment type rejected');
assert.equal(sanitizeCustomCategories([{ id: 'sarees', label: 'Sarees', gender: 'women', garmentType: 'saree' }]), null, 'cannot shadow a master category id');
assert.equal(isCustomCategoryId('sarees'), false);
assert.equal(isCustomCategoryId('custom-jumpsuits-abc123'), true);

// It shows up alongside the master list for its own gender only.
const womenAll = allCategoriesFor('women', customs);
assert.ok(womenAll.some((cat) => cat.id === 'custom-jumpsuits-abc123'), 'custom category appears for its gender');
const menAll = allCategoriesFor('men', customs);
assert.ok(!menAll.some((cat) => cat.id === 'custom-jumpsuits-abc123'), 'custom category does not leak into another gender');

// With no explicit categoryLists override, categoriesFor shows it automatically (the "everything" default).
const shownByDefault = categoriesFor(undefined, 'women', customs);
assert.ok(shownByDefault.some((cat) => cat.id === 'custom-jumpsuits-abc123'), 'shows up with no override');

// sanitizeCategoryLists accepts the custom id once it is a known custom category.
const lists = sanitizeCategoryLists({ women: ['sarees', 'custom-jumpsuits-abc123'] }, customs);
assert.ok(lists, 'categoryLists sanitizes with a known custom id');
assert.deepEqual(lists.women, ['sarees', 'custom-jumpsuits-abc123']);

// Without being told about the custom category, the same list is rejected (as if the id did not exist).
const listsWithoutCustoms = sanitizeCategoryLists({ women: ['sarees', 'custom-jumpsuits-abc123'] }, []);
assert.ok(listsWithoutCustoms, 'still sanitizes (drops the unknown id)');
assert.deepEqual(listsWithoutCustoms.women, ['sarees']);

// findCategory resolves either a master or a custom category by id, with the right gender/audience/garmentType.
const found = findCategory('custom-jumpsuits-abc123', customs);
assert.ok(found);
assert.equal(found.gender, 'women');
assert.equal(found.audience, 'Women');
assert.equal(found.garmentType, 'one_piece');
assert.equal(findCategory('does-not-exist', customs), undefined);

console.log('custom categories: all checks passed');
