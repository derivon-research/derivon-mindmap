import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';

export function isValidEditorTransaction(transaction: Transaction): boolean {
  try {
    transaction.doc.check();
    return true;
  } catch (error) {
    console.error('[Derivon] Rejected editor transaction with invalid schema content', error);
    return false;
  }
}

export function createEditorSchemaGuardPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('derivonSchemaGuard'),
    filterTransaction: isValidEditorTransaction,
  });
}

export const EditorSchemaGuard = Extension.create({
  name: 'derivonSchemaGuard',
  priority: 10_000,
  addProseMirrorPlugins() {
    return [createEditorSchemaGuardPlugin()];
  },
});
