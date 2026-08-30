import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { describe, expect, test, vi } from 'vitest';
import { createEditorSchemaGuardPlugin } from './editorSchemaGuard';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    blockquote: { content: 'block+', group: 'block' },
    text: { group: 'inline' },
  },
});

function validDocument() {
  return schema.node('doc', null, [schema.node('paragraph', null, [schema.text('valid')])]);
}

function invalidDocument() {
  const invalidQuote = schema.nodes.blockquote.create(null, [schema.text('invalid direct text')]);
  return schema.nodes.doc.create(null, [invalidQuote]);
}

describe('editor schema transaction guard', () => {
  test('accepts metadata transactions on a valid document', () => {
    const state = EditorState.create({
      doc: validDocument(),
      plugins: [createEditorSchemaGuardPlugin()],
    });

    const result = state.applyTransaction(state.tr.setMeta('blur', true));

    expect(result.transactions).toHaveLength(1);
    expect(result.state.doc.eq(state.doc)).toBe(true);
  });

  test('rejects blur before plugins can process an already-invalid document', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const state = EditorState.create({
      doc: invalidDocument(),
      plugins: [createEditorSchemaGuardPlugin()],
    });

    try {
      const result = state.applyTransaction(state.tr.setMeta('blur', true));

      expect(result.transactions).toHaveLength(0);
      expect(result.state).toBe(state);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
