/**
 * Uccharon — escapeHtml() security tests
 *
 * Runnable with plain Node (no test framework needed):
 *
 *     node coach/static/coach/js/tests/escapeHtml.test.js
 *
 * WHY THIS EXISTS
 * ---------------
 * escapeHtml() (defined in ../main.js) is the single sanitizer that ALL
 * dynamically-rendered AI/user content passes through before being placed into
 * innerHTML strings — including into quoted HTML attributes such as
 *     `data-word="${escapeHtml(value)}"`.
 *
 * The earlier implementation only escaped &, <, > (via textContent/innerHTML)
 * and left quotes intact, so a value containing a `"` could break out of an
 * attribute and inject new attributes/event handlers. These tests lock in that
 * all five HTML-significant characters (& < > " ') are escaped, so the function
 * is safe in text nodes AND in single/double-quoted attributes.
 *
 * To test the REAL function (not a copy), we read main.js and extract the
 * exact _HTML_ESCAPE_MAP + escapeHtml definitions, then evaluate them in an
 * isolated scope. This way the test fails if the production code ever regresses.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Load the real escapeHtml implementation from main.js ─────────────────────
const mainJsPath = path.join(__dirname, '..', 'main.js');
const source = fs.readFileSync(mainJsPath, 'utf8');

const mapMatch = source.match(/const _HTML_ESCAPE_MAP = \{[\s\S]*?\};/);
const fnMatch = source.match(/function escapeHtml\(text\) \{[\s\S]*?\n {4}\}/);

assert.ok(mapMatch, 'Could not locate _HTML_ESCAPE_MAP in main.js');
assert.ok(fnMatch, 'Could not locate escapeHtml() in main.js');

// Build the function in an isolated scope from the exact production source.
// eslint-disable-next-line no-new-func
const escapeHtml = new Function(
    `${mapMatch[0]}\n${fnMatch[0]}\nreturn escapeHtml;`
)();

// ── Test helpers ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed += 1;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        failed += 1;
        console.error(`  ✗ ${name}`);
        console.error(`      ${err.message}`);
    }
}

console.log('escapeHtml() security tests\n');

// ── Core character escaping ──────────────────────────────────────────────────
test('escapes ampersand', () => {
    assert.strictEqual(escapeHtml('a & b'), 'a &amp; b');
});

test('escapes less-than and greater-than', () => {
    assert.strictEqual(escapeHtml('1 < 2 > 0'), '1 &lt; 2 &gt; 0');
});

test('escapes double quotes (the key attribute-injection fix)', () => {
    assert.strictEqual(escapeHtml('say "hi"'), 'say &quot;hi&quot;');
});

test('escapes single quotes', () => {
    assert.strictEqual(escapeHtml("it's"), 'it&#39;s');
});

test('escapes all five significant characters together', () => {
    assert.strictEqual(
        escapeHtml(`& < > " '`),
        '&amp; &lt; &gt; &quot; &#39;'
    );
});

// ── Malicious input: script/HTML injection ───────────────────────────────────
test('neutralizes a <script> tag', () => {
    const out = escapeHtml('<script>alert(1)</script>');
    assert.strictEqual(out, '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.ok(!out.includes('<script>'), 'raw <script> tag must not survive');
});

test('neutralizes an <img onerror> XSS payload', () => {
    const out = escapeHtml('<img src=x onerror=alert(1)>');
    assert.ok(!out.includes('<img'), 'raw <img must not survive');
    assert.ok(out.includes('&lt;img'), 'tag must be escaped');
});

// ── Malicious input: double-quoted attribute breakout ────────────────────────
// Simulates: data-word="${escapeHtml(payload)}"
test('cannot break out of a double-quoted attribute', () => {
    const payload = '" onmouseover="alert(document.cookie)" x="';
    const escaped = escapeHtml(payload);
    assert.ok(!escaped.includes('"'), 'no raw double quote may remain');

    const html = `<button data-word="${escaped}">x</button>`;
    // The only literal double quotes left are the two we added ourselves.
    assert.strictEqual((html.match(/"/g) || []).length, 2,
        'attribute must not be broken open by injected quotes');
    assert.ok(!html.includes('onmouseover="alert'),
        'injected event handler must not become a live attribute');
});

// ── Malicious input: single-quoted attribute breakout ────────────────────────
test('cannot break out of a single-quoted attribute', () => {
    const payload = "' onclick='steal()' x='";
    const escaped = escapeHtml(payload);
    assert.ok(!escaped.includes("'"), 'no raw single quote may remain');

    const html = `<button data-word='${escaped}'>x</button>`;
    assert.strictEqual((html.match(/'/g) || []).length, 2,
        'attribute must not be broken open by injected single quotes');
    assert.ok(!html.includes("onclick='steal"),
        'injected event handler must not become a live attribute');
});

// ── Ampersand-first ordering (no double-escaping bugs) ───────────────────────
test('escapes ampersand before entities (order is correct)', () => {
    // If & were escaped last, "&lt;" input would wrongly become "&amp;lt;".
    // Input already-escaped-looking text should escape the leading & once.
    assert.strictEqual(escapeHtml('&lt;'), '&amp;lt;');
});

// ── Edge cases / non-strings ─────────────────────────────────────────────────
test('empty string returns empty string', () => {
    assert.strictEqual(escapeHtml(''), '');
});

test('null / undefined return empty string', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
});

test('coerces non-string input safely', () => {
    assert.strictEqual(escapeHtml(0), '');       // 0 is treated as empty by design
    assert.strictEqual(escapeHtml(42), '42');
    assert.strictEqual(escapeHtml(true), 'true');
});

test('leaves safe text untouched', () => {
    assert.strictEqual(escapeHtml('Hello world 123'), 'Hello world 123');
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
