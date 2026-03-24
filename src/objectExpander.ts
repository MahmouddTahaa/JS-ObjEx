/**
 * objectExpander.ts
 *
 * All the actual parsing, expanding, and collapsing logic lives here.
 * This module has zero dependency on the VS Code API, so it's easy
 * to reason about and test in isolation.
 */

// -- Types ------------------------------------------------------------------

export interface ExpandOptions {
  /** How many characters fit on one line from the opening brace onward. */
  availableWidth: number;
  /** One indent level — could be "  " or "\t", depends on the user's editor. */
  indentUnit: string;
  /** The whitespace that already sits at the start of the line we're on. */
  baseIndent: string;
  /** Objects scoring above this get expanded; lower = more aggressive. */
  complexityThreshold: number;
  /** Don't recurse deeper than this when expanding nested stuff. */
  maxExpandDepth: number;
  /** What to do with trailing commas: always add, never add, or leave as-is. */
  trailingCommas: 'always' | 'never' | 'preserve';
  /** If true, keep `{ singleKey: value }` on one line inside a bigger object. */
  collapseOnSingleProperty: boolean;
}

/** A pair of character offsets pointing at matching brackets in the source. */
export interface BracketRange {
  start: number;
  end: number;
  kind: '{' | '[';
}

// -- Skip zones (strings, comments, regex) ----------------------------------

/**
 * Scans through the source and marks regions we should ignore when looking
 * for brackets — things like string literals, template strings, and comments.
 * Returns an array of [start, end] offset pairs.
 */
function buildSkipZones(text: string): Array<[number, number]> {
  const zones: Array<[number, number]> = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // Single-line comment: skip until end of line
    if (ch === '/' && text[i + 1] === '/') {
      const start = i;
      i += 2;
      while (i < text.length && text[i] !== '\n') { i++; }
      zones.push([start, i - 1]);
      continue;
    }

    // Block comment: skip until */
    if (ch === '/' && text[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { i++; }
      i += 2;
      zones.push([start, i - 1]);
      continue;
    }

    // Template literal (backtick strings)
    if (ch === '`') {
      const start = i;
      i++;
      while (i < text.length && text[i] !== '`') {
        if (text[i] === '\\') { i++; }
        i++;
      }
      zones.push([start, i]);
      i++;
      continue;
    }

    // Regular string literals (" or ')
    if (ch === '"' || ch === "'") {
      const start = i;
      const quote = ch;
      i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') { i++; }
        i++;
      }
      zones.push([start, i]);
      i++;
      continue;
    }

    i++;
  }

  return zones;
}

/** Quick helper — checks if a character position falls inside any skip zone. */
function makeSkipCheck(zones: Array<[number, number]>): (pos: number) => boolean {
  return (pos: number) => zones.some(([s, e]) => pos >= s && pos <= e);
}

// -- Bracket finder (single object around cursor) --------------------------

/**
 * Given the full document text and a cursor offset, walks outward to find the
 * nearest enclosing { } or [ ] pair. Skips over anything inside strings or
 * comments so we don't get tricked by brackets in weird places.
 */
export function findObjectBounds(text: string, offset: number): BracketRange | null {
  const isSkipped = makeSkipCheck(buildSkipZones(text));

  // Walk left to find the opening bracket
  const stack: Array<'{' | '['> = [];
  let openPos = -1;
  let openKind: '{' | '[' | null = null;

  for (let i = offset; i >= 0; i--) {
    if (isSkipped(i)) { continue; }
    const ch = text[i];

    if (ch === '}' || ch === ']') {
      // We hit a closing bracket — push its matching opener so we can skip
      // past its pair when we encounter it going left
      stack.push(ch === '}' ? '{' : '[');
    } else if (ch === '{' || ch === '[') {
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop(); // this bracket belongs to a nested pair, skip it
      } else {
        openPos = i;
        openKind = ch;
        break;
      }
    }
  }

  if (openPos === -1 || openKind === null) { return null; }

  // Now walk right from the opener to find its matching closer
  const expectedClose = openKind === '{' ? '}' : ']';
  let depth = 0;

  for (let i = openPos; i < text.length; i++) {
    if (isSkipped(i)) { continue; }
    if (text[i] === openKind) { depth++; }
    if (text[i] === expectedClose) {
      depth--;
      if (depth === 0) {
        return { start: openPos, end: i, kind: openKind };
      }
    }
  }

  return null; // brackets aren't balanced — bail out
}

// -- Document-wide bracket scanner -----------------------------------------

/**
 * Finds every top-level { } and [ ] pair in the entire document.
 * "Top-level" means we skip over nested brackets — if { } appears inside
 * another { }, only the outer one is returned.
 *
 * Results come back in reverse order (bottom of document first) so you can
 * apply text edits from the end without messing up earlier offsets.
 */
export function findAllTopLevelBrackets(text: string): BracketRange[] {
  const isSkipped = makeSkipCheck(buildSkipZones(text));
  const ranges: BracketRange[] = [];
  let i = 0;

  while (i < text.length) {
    if (isSkipped(i)) { i++; continue; }

    const ch = text[i];
    if (ch === '{' || ch === '[') {
      const expectedClose = ch === '{' ? '}' : ']';
      let depth = 1;
      let j = i + 1;

      // Walk forward to find the matching closer
      while (j < text.length && depth > 0) {
        if (!isSkipped(j)) {
          if (text[j] === ch) { depth++; }
          if (text[j] === expectedClose) { depth--; }
        }
        if (depth > 0) { j++; }
      }

      if (depth === 0) {
        ranges.push({ start: i, end: j, kind: ch });
        i = j + 1; // jump past this whole bracket pair
        continue;
      }
    }

    i++;
  }

  // Reverse so edits can be applied bottom-to-top safely
  return ranges.reverse();
}

// -- Complexity scoring ----------------------------------------------------

/**
 * Gives a numeric score to the content inside a bracket pair. The idea is
 * simple: longer content, more commas (= more entries), and deeper nesting
 * all mean "this would benefit from being expanded across multiple lines."
 *
 * The weights are tuned so a simple `{ a: 1 }` scores around 10, while
 * something like a Mongoose subdocument with several fields lands at 50-80.
 */
export function getComplexity(innerText: string): number {
  const lengthScore = innerText.length;
  let commaCount = 0;
  let maxDepth = 0;
  let depth = 0;

  const isSkipped = makeSkipCheck(buildSkipZones(innerText));

  for (let i = 0; i < innerText.length; i++) {
    if (isSkipped(i)) { continue; }
    const ch = innerText[i];
    if (ch === ',' && depth === 0) { commaCount++; }
    if (ch === '{' || ch === '[') { depth++; maxDepth = Math.max(maxDepth, depth); }
    if (ch === '}' || ch === ']') { depth--; }
  }

  return Math.round(lengthScore * 0.3 + commaCount * 8 + maxDepth * 12);
}

// -- Collapse ---------------------------------------------------------------

/**
 * Squashes a (potentially multi-line) object or array literal down to a
 * single line. Normalises whitespace so you get clean, consistent spacing:
 * `{ key: value, other: stuff }` instead of random indentation.
 */
export function collapseObject(text: string): string {
  let result = text.replace(/\s*\n\s*/g, ' ');      // flatten newlines
  result = result.replace(/  +/g, ' ');              // collapse repeated spaces
  result = result.replace(/\{\s+/g, '{ ');           // clean after {
  result = result.replace(/\s+\}/g, ' }');           // clean before }
  result = result.replace(/\[\s+/g, '[');            // clean after [
  result = result.replace(/\s+\]/g, ']');            // clean before ]
  result = result.replace(/\s*:\s*/g, ': ');         // consistent colon spacing
  result = result.replace(/,\s*\}/g, ' }');          // drop trailing comma in objects
  result = result.replace(/,\s*\]/g, ']');           // drop trailing comma in arrays
  return result.trim();
}

// -- Expand -----------------------------------------------------------------

/**
 * Takes a collapsed or messy object/array literal and expands it into clean,
 * multi-line, properly indented form. Nested structures get expanded
 * recursively if they're complex enough to warrant it.
 */
export function expandObject(text: string, options: ExpandOptions): string {
  // Always start from a clean collapsed form so we get consistent output
  const collapsed = collapseObject(text);
  return expandRecursive(collapsed, options, 0);
}

/**
 * The recursive workhorse that handles expansion at each nesting level.
 */
function expandRecursive(text: string, options: ExpandOptions, depth: number): string {
  const trimmed = text.trim();

  const isObject = trimmed.startsWith('{');
  const isArray = trimmed.startsWith('[');
  if (!isObject && !isArray) { return trimmed; }

  const open = isObject ? '{' : '[';
  const close = isObject ? '}' : ']';
  const inner = trimmed.slice(1, trimmed.length - 1).trim();

  // Nothing inside? Just return empty brackets.
  if (inner.length === 0) { return `${open}${close}`; }

  // Split the content at top-level commas (respecting nested brackets/strings)
  const entries = splitEntries(inner);

  // Single-property shortcut: keep it inline if the user wants that and it fits
  if (options.collapseOnSingleProperty && entries.length === 1 && depth > 0) {
    const singleLine = `${open} ${entries[0].trim()} ${close}`;
    if (singleLine.length <= options.availableWidth) {
      return singleLine;
    }
  }

  // Check if everything fits on one line and isn't too complex
  const oneLine = `${open} ${entries.map(e => e.trim()).join(', ')} ${close}`;
  const complexity = getComplexity(inner);
  if (oneLine.length <= options.availableWidth && complexity < options.complexityThreshold) {
    return oneLine;
  }

  // Okay, we need multiple lines. Build them up.
  const childIndent = options.baseIndent + options.indentUnit.repeat(depth + 1);
  const closingIndent = options.baseIndent + options.indentUnit.repeat(depth);
  const lines: string[] = [open];

  for (let i = 0; i < entries.length; i++) {
    let entry = entries[i].trim();

    // Try to expand any nested objects/arrays inside this entry
    if (depth + 1 < options.maxExpandDepth) {
      entry = tryExpandNested(entry, options, depth + 1);
    }

    const isLast = i === entries.length - 1;
    const comma = pickTrailingComma(isLast, options.trailingCommas);
    lines.push(`${childIndent}${entry}${comma}`);
  }

  lines.push(`${closingIndent}${close}`);
  return lines.join('\n');
}

// -- Entry splitting --------------------------------------------------------

/**
 * Splits something like `a: 1, b: { x: 2 }, c: [3, 4]` into three separate
 * entries at the top-level commas. Commas inside nested brackets or strings
 * are left alone.
 */
function splitEntries(text: string): string[] {
  const entries: string[] = [];
  let current = '';
  let depth = 0;
  const isSkipped = makeSkipCheck(buildSkipZones(text));

  for (let i = 0; i < text.length; i++) {
    if (isSkipped(i)) {
      current += text[i];
      continue;
    }

    const ch = text[i];
    if (ch === '{' || ch === '[' || ch === '(') { depth++; }
    if (ch === '}' || ch === ']' || ch === ')') { depth--; }

    if (ch === ',' && depth === 0) {
      entries.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim().length > 0) {
    entries.push(current.trim());
  }

  return entries;
}

// -- Nested structure expansion ---------------------------------------------

/**
 * Looks inside a single entry (like `key: { a: 1, b: 2 }`) for a nested
 * object or array. If it finds one that's complex enough, it expands it
 * in place. Otherwise leaves the entry as-is.
 */
function tryExpandNested(entry: string, options: ExpandOptions, depth: number): string {
  const isSkipped = makeSkipCheck(buildSkipZones(entry));

  // Find the first { or [ that isn't inside a string/comment
  let braceStart = -1;
  for (let i = 0; i < entry.length; i++) {
    if (isSkipped(i)) { continue; }
    if (entry[i] === '{' || entry[i] === '[') {
      braceStart = i;
      break;
    }
  }

  if (braceStart === -1) { return entry; }

  // Walk forward to find the matching closer
  const openCh = entry[braceStart];
  const closeCh = openCh === '{' ? '}' : ']';
  let d = 0;
  let braceEnd = -1;

  for (let i = braceStart; i < entry.length; i++) {
    if (isSkipped(i)) { continue; }
    if (entry[i] === openCh) { d++; }
    if (entry[i] === closeCh) {
      d--;
      if (d === 0) { braceEnd = i; break; }
    }
  }

  if (braceEnd === -1) { return entry; }

  // Only expand if the nested content is complex enough
  const nestedText = entry.slice(braceStart, braceEnd + 1);
  const innerContent = nestedText.slice(1, nestedText.length - 1).trim();

  if (getComplexity(innerContent) >= options.complexityThreshold) {
    const expanded = expandRecursive(nestedText, options, depth);
    return entry.slice(0, braceStart) + expanded + entry.slice(braceEnd + 1);
  }

  return entry;
}

// -- Helpers ----------------------------------------------------------------

/**
 * Figures out whether to add a comma after an entry based on the user's
 * trailing-comma preference.
 */
function pickTrailingComma(
  isLast: boolean,
  strategy: 'always' | 'never' | 'preserve'
): string {
  if (!isLast) { return ','; }
  switch (strategy) {
    case 'always':  return ',';
    case 'never':   return '';
    case 'preserve': return '';
  }
}

/**
 * Quick check: does this text span multiple lines? If so, it's already
 * in expanded form.
 */
export function isExpanded(text: string): boolean {
  return text.includes('\n');
}
