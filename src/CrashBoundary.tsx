import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { formatFrontendCrash, persistFrontendCrash } from './crashReport';

type CrashBoundaryState = {
  error: Error | null;
  details: string;
  copied: boolean;
};

export class CrashBoundary extends Component<{ children: ReactNode }, CrashBoundaryState> {
  state: CrashBoundaryState = { error: null, details: '', copied: false };

  static getDerivedStateFromError(error: Error): Partial<CrashBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const details = formatFrontendCrash('React 渲染异常', error, info.componentStack ?? undefined);
    persistFrontendCrash(details);
    this.setState({ details });
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const details = this.state.details || formatFrontendCrash('React 渲染异常', this.state.error);
    return (
      <main className="crash-screen">
        <section className="workspace-error-modal crash-report-modal" role="alert" aria-label="应用崩溃报告">
          <header><div><span className="eyebrow">应用异常</span><strong>Derivon 无法继续渲染</strong></div></header>
          <p>报告已保存在本机，不会自动上传。请复制报告后重新加载应用。</p>
          <pre tabIndex={0}>{details}</pre>
          <footer>
            <button type="button" onClick={() => window.location.reload()}><RefreshCw size={14} />重新加载</button>
            <button type="button" className="primary-button" onClick={() => {
              void navigator.clipboard.writeText(details).then(() => this.setState({ copied: true }));
            }}><Copy size={14} />{this.state.copied ? '已复制' : '复制报告'}</button>
          </footer>
        </section>
      </main>
    );
  }
}
