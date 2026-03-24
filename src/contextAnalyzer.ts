/**
 * contextAnalyzer.ts
 *
 * The bridge between VS Code and the expansion logic. This is the only file
 * that touches the vscode API — it reads editor state (cursor position,
 * indent settings, ruler width) and packages it up for objectExpander.
 */

import * as vscode from 'vscode';
import { ExpandOptions, BracketRange, findObjectBounds, findAllTopLevelBrackets } from './objectExpander';

// -- Configuration ----------------------------------------------------------

const CONFIG_SECTION = 'jsObjectExpander';

interface ExtensionConfig {
  complexityThreshold: number;
  trailingCommas: 'always' | 'never' | 'preserve';
  maxExpandDepth: number;
  collapseOnSingleProperty: boolean;
  formatOnSave: boolean;
}

/** Pulls the current settings from the user's VS Code configuration. */
function readConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    complexityThreshold: cfg.get<number>('complexityThreshold', 40),
    trailingCommas: cfg.get<'always' | 'never' | 'preserve'>('trailingCommas', 'always'),
    maxExpandDepth: cfg.get<number>('maxExpandDepth', 10),
    collapseOnSingleProperty: cfg.get<boolean>('collapseOnSingleProperty', true),
    formatOnSave: cfg.get<boolean>('formatOnSave', false),
  };
}

/** Quick check used by extension.ts to decide whether to run on save. */
export function isFormatOnSaveEnabled(): boolean {
  return readConfig().formatOnSave;
}

// -- Editor helpers ---------------------------------------------------------

/** Returns the string used for one indent level (spaces or a tab). */
function getIndentUnit(editor: vscode.TextEditor): string {
  const useSpaces = editor.options.insertSpaces as boolean;
  const tabSize = editor.options.tabSize as number;
  return useSpaces ? ' '.repeat(tabSize) : '\t';
}

/**
 * Figures out how many characters we have to work with on a single line.
 * Uses the first ruler if one is set, otherwise falls back to the
 * word-wrap column, or 120 as a last resort.
 */
function getAvailableWidth(editor: vscode.TextEditor, braceColumn: number): number {
  const editorConfig = vscode.workspace.getConfiguration('editor');
  const rulers: number[] = editorConfig.get<number[]>('rulers', []);
  const wordWrapColumn: number = editorConfig.get<number>('wordWrapColumn', 80);

  const maxColumn = rulers.length > 0 ? rulers[0] : (wordWrapColumn || 120);
  return Math.max(maxColumn - braceColumn, 30); // always leave at least 30 chars
}

/** Grabs the leading whitespace from a given line — that's our base indent. */
function getBaseIndent(document: vscode.TextDocument, line: number): string {
  const lineText = document.lineAt(line).text;
  const match = lineText.match(/^(\s*)/);
  return match ? match[1] : '';
}

// -- Analysis result --------------------------------------------------------

export interface AnalysisResult {
  fullText: string;
  range: BracketRange;
  vsRange: vscode.Range;
  options: ExpandOptions;
}

// -- Single-object analysis (at cursor) -------------------------------------

/**
 * Looks at where the cursor is, finds the nearest enclosing object or array,
 * and returns everything the expander needs to do its job. Returns null if
 * the cursor isn't sitting inside any bracket pair.
 */
export function analyzeContext(editor: vscode.TextEditor): AnalysisResult | null {
  const document = editor.document;
  const fullText = document.getText();
  const offset = document.offsetAt(editor.selection.active);

  const range = findObjectBounds(fullText, offset);
  if (!range) { return null; }

  const startPos = document.positionAt(range.start);
  const endPos = document.positionAt(range.end);
  const vsRange = new vscode.Range(startPos, endPos.translate(0, 1)); // +1 to include the closing bracket

  const config = readConfig();
  const options: ExpandOptions = {
    availableWidth: getAvailableWidth(editor, startPos.character),
    indentUnit: getIndentUnit(editor),
    baseIndent: getBaseIndent(document, startPos.line),
    complexityThreshold: config.complexityThreshold,
    maxExpandDepth: config.maxExpandDepth,
    trailingCommas: config.trailingCommas,
    collapseOnSingleProperty: config.collapseOnSingleProperty,
  };

  return { fullText, range, vsRange, options };
}

// -- Whole-document analysis (for format-on-save) ---------------------------

/**
 * Scans the entire document for top-level bracket pairs and returns an
 * AnalysisResult for each one. Results come back in reverse order (bottom
 * of the file first) so edits can be applied sequentially without shifting
 * earlier offsets.
 */
export function analyzeForDocument(editor: vscode.TextEditor): AnalysisResult[] {
  const document = editor.document;
  const fullText = document.getText();
  const brackets = findAllTopLevelBrackets(fullText);

  const config = readConfig();
  const indentUnit = getIndentUnit(editor);
  const results: AnalysisResult[] = [];

  for (const range of brackets) {
    const startPos = document.positionAt(range.start);
    const endPos = document.positionAt(range.end);
    const vsRange = new vscode.Range(startPos, endPos.translate(0, 1));

    results.push({
      fullText,
      range,
      vsRange,
      options: {
        availableWidth: getAvailableWidth(editor, startPos.character),
        indentUnit,
        baseIndent: getBaseIndent(document, startPos.line),
        complexityThreshold: config.complexityThreshold,
        maxExpandDepth: config.maxExpandDepth,
        trailingCommas: config.trailingCommas,
        collapseOnSingleProperty: config.collapseOnSingleProperty,
      },
    });
  }

  return results;
}
