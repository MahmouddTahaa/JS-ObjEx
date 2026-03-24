import * as vscode from 'vscode';
import { expandObject, collapseObject, isExpanded, getComplexity } from './objectExpander';
import { analyzeContext, analyzeForDocument, isFormatOnSaveEnabled } from './contextAnalyzer';

// Languages where format-on-save is allowed to run
const SUPPORTED_LANGUAGES = new Set([
  'javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'json', 'jsonc',
]);

// -- Command handlers -------------------------------------------------------

/** Expands the object/array under the cursor into multi-line form. */
async function smartExpand(editor: vscode.TextEditor): Promise<void> {
  const result = analyzeContext(editor);
  if (!result) {
    vscode.window.showInformationMessage('No object or array found at cursor.');
    return;
  }

  const originalText = editor.document.getText(result.vsRange);
  const expanded = expandObject(originalText, result.options);

  if (expanded === originalText) {
    vscode.window.showInformationMessage('Object is already fully expanded.');
    return;
  }

  await editor.edit(editBuilder => {
    editBuilder.replace(result.vsRange, expanded);
  });
}

/** Collapses the object/array under the cursor to a single line. */
async function smartCollapse(editor: vscode.TextEditor): Promise<void> {
  const result = analyzeContext(editor);
  if (!result) {
    vscode.window.showInformationMessage('No object or array found at cursor.');
    return;
  }

  const originalText = editor.document.getText(result.vsRange);
  const collapsed = collapseObject(originalText);

  if (collapsed === originalText) {
    vscode.window.showInformationMessage('Object is already collapsed.');
    return;
  }

  await editor.edit(editBuilder => {
    editBuilder.replace(result.vsRange, collapsed);
  });
}

/** Flips the object/array under the cursor between expanded and collapsed. */
async function toggle(editor: vscode.TextEditor): Promise<void> {
  const result = analyzeContext(editor);
  if (!result) {
    vscode.window.showInformationMessage('No object or array found at cursor.');
    return;
  }

  const originalText = editor.document.getText(result.vsRange);

  if (isExpanded(originalText)) {
    const collapsed = collapseObject(originalText);
    await editor.edit(eb => eb.replace(result.vsRange, collapsed));
  } else {
    const expanded = expandObject(originalText, result.options);
    await editor.edit(eb => eb.replace(result.vsRange, expanded));
  }
}

// -- Format-on-save ---------------------------------------------------------

/**
 * Runs through every top-level object/array in the document and expands
 * the ones that are complex enough. Used by the save listener below.
 */
async function formatDocumentObjects(editor: vscode.TextEditor): Promise<void> {
  const results = analyzeForDocument(editor);
  if (results.length === 0) { return; }

  // We apply all edits in one batch (bottom-to-top order is already handled
  // by analyzeForDocument, so earlier offsets stay valid)
  await editor.edit(editBuilder => {
    for (const result of results) {
      const originalText = editor.document.getText(result.vsRange);
      const innerText = originalText.slice(1, originalText.length - 1).trim();
      const complexity = getComplexity(innerText);

      if (complexity >= result.options.complexityThreshold) {
        const expanded = expandObject(originalText, result.options);
        if (expanded !== originalText) {
          editBuilder.replace(result.vsRange, expanded);
        }
      }
    }
  });
}

// -- Activation & cleanup ---------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
  console.log('JS Object Expander is now active.');

  // Register the three editor commands
  const commands: Array<[string, (editor: vscode.TextEditor) => Promise<void>]> = [
    ['js-object-expander.smartExpand', smartExpand],
    ['js-object-expander.smartCollapse', smartCollapse],
    ['js-object-expander.toggle', toggle],
  ];

  for (const [id, handler] of commands) {
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(id, handler)
    );
  }

  // Hook into the save event to auto-expand complex objects (if enabled)
  const saveListener = vscode.workspace.onWillSaveTextDocument(event => {
    if (!isFormatOnSaveEnabled()) { return; }
    if (!SUPPORTED_LANGUAGES.has(event.document.languageId)) { return; }

    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === event.document.uri.toString()
    );
    if (!editor) { return; }

    event.waitUntil(
      formatDocumentObjects(editor).then(() => [] as vscode.TextEdit[])
    );
  });

  context.subscriptions.push(saveListener);
}

export function deactivate() {}
