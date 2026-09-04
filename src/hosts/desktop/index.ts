// The composition the build resolves `#host` to. See `../web/index.ts` for why the entry
// module imports `./host` directly rather than through this facade.
export { host } from './host';
export {
  createDesktopWorkspaceSource,
  type DesktopInvoke,
} from './desktopWorkspaceSource';
