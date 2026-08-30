import { Image } from '@tiptap/extension-image';

export type ResolvedEditorImage = {
  url: string;
  release?: () => void;
};

export type EditorImageResolver = (source: string) => Promise<ResolvedEditorImage>;

export function createEditorImage(resolveImage: EditorImageResolver) {
  return Image.extend({
    addNodeView() {
      return ({ node }) => {
        const container = document.createElement('figure');
        const image = document.createElement('img');
        const failure = document.createElement('figcaption');
        const failureLabel = document.createElement('strong');
        const failureSource = document.createElement('code');
        let currentNode = node;
        let requestId = 0;
        let releaseImage: (() => void) | undefined;

        container.className = 'workspace-image';
        image.decoding = 'async';
        image.draggable = false;
        failure.className = 'workspace-image-error';
        failure.hidden = true;
        failure.append(failureLabel, failureSource);
        container.append(image, failure);

        const releaseCurrentImage = () => {
          releaseImage?.();
          releaseImage = undefined;
        };
        const showFailure = (reason?: unknown) => {
          const source = String(currentNode.attrs.src ?? '');
          const alt = String(currentNode.attrs.alt ?? '').trim();
          image.hidden = true;
          failure.hidden = false;
          failureLabel.textContent = alt || '图片无法加载';
          failureSource.textContent = source;
          failure.title = reason instanceof Error ? reason.message : '';
          container.dataset.state = 'error';
        };
        const showImage = () => {
          image.hidden = false;
          failure.hidden = true;
          container.dataset.state = 'ready';
        };
        const loadImage = async () => {
          const source = String(currentNode.attrs.src ?? '').trim();
          const loadId = ++requestId;
          releaseCurrentImage();
          image.hidden = true;
          failure.hidden = true;
          container.dataset.state = 'loading';
          image.alt = String(currentNode.attrs.alt ?? '');
          image.title = String(currentNode.attrs.title ?? '');
          image.removeAttribute('src');
          if (!source) {
            showFailure();
            return;
          }
          try {
            const resolved = await resolveImage(source);
            if (loadId !== requestId) {
              resolved.release?.();
              return;
            }
            releaseImage = resolved.release;
            image.onload = () => {
              if (loadId === requestId) showImage();
            };
            image.onerror = () => {
              if (loadId !== requestId) return;
              releaseCurrentImage();
              showFailure(new Error('图片资源无法解码或读取'));
            };
            image.src = resolved.url;
          } catch (error) {
            if (loadId === requestId) showFailure(error);
          }
        };

        void loadImage();

        return {
          dom: container,
          update: (updatedNode) => {
            if (updatedNode.type !== currentNode.type) return false;
            const sourceChanged = updatedNode.attrs.src !== currentNode.attrs.src;
            currentNode = updatedNode;
            image.alt = String(currentNode.attrs.alt ?? '');
            image.title = String(currentNode.attrs.title ?? '');
            failureLabel.textContent = String(currentNode.attrs.alt ?? '').trim() || '图片无法加载';
            failureSource.textContent = String(currentNode.attrs.src ?? '');
            if (sourceChanged) void loadImage();
            return true;
          },
          ignoreMutation: () => true,
          destroy: () => {
            requestId += 1;
            image.onload = null;
            image.onerror = null;
            releaseCurrentImage();
          },
        };
      };
    },
  }).configure({
    allowBase64: false,
    inline: false,
  });
}
