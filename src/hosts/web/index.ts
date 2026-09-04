// The composition the build resolves `#host` to. It is imported from `./host` directly,
// never through this facade, so the first chunk cannot pick up the bundled workspace.
export { host } from './host';
export {
  bundledExampleWorkspaceSource,
  createBundledWorkspaceSource,
  type BundledWorkspace,
} from './bundledWorkspaceSource';
export type { RemoteWorkspaceSource } from './remoteWorkspaceSource';
