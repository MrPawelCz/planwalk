import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLang, makeT, setLang } from '../../viewer/src/i18n.js';

test('detectLang: ?lang= wins, then the browser language, else English', () => {
  assert.equal(detectLang('?lang=pl', { language: 'en-GB' }), 'pl');
  assert.equal(detectLang('?lang=en', { languages: ['pl-PL'] }), 'en');
  assert.equal(detectLang('', { languages: ['pl-PL', 'en'] }), 'pl');
  assert.equal(detectLang('', { language: 'de-DE' }), 'en');
  assert.equal(detectLang('?lang=xx', {}), 'en');
});

test('makeT: current language, English fallback, placeholders, own keys only', () => {
  const t = makeT({ en: { hi: 'Hello {name}', only: 'Only English' }, pl: { hi: 'Cześć {name}' } });
  setLang('pl');
  assert.equal(t('hi', { name: 'Ada' }), 'Cześć Ada');
  assert.equal(t('only'), 'Only English');
  assert.equal(t('missing'), 'missing');
  assert.equal(t('constructor'), 'constructor');
  setLang('en');
  assert.equal(t('hi', { name: 'Ada' }), 'Hello Ada');
  assert.equal(t('hi', {}), 'Hello {name}');
});
