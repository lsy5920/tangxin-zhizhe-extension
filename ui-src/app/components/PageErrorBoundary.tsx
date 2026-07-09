import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

type Props = {
  title?: string;
  children: ReactNode;
  onReset?: () => void;
};

type State = {
  error: Error | null;
};

/**
 * 页面级错误边界：某个子页面（如播放页）渲染崩溃时，只替换该区域，
 * 不拖垮整个插件壳层，避免悬浮球和面板一起消失。
 */
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[糖心志者] 页面渲染异常", error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="m-4 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-rose-700">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold">
          <AlertCircle size={16} />
          {this.props.title || "页面加载失败"}
        </div>
        <p className="mb-3 text-xs leading-relaxed text-rose-600/90">
          {this.state.error.message || "未知渲染错误。插件外壳仍可正常使用，请重试或切换其他页面。"}
        </p>
        <button
          type="button"
          onClick={this.handleReset}
          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 px-3 py-2 text-xs font-medium text-white transition-transform active:scale-95"
        >
          <RefreshCw size={13} /> 重试加载
        </button>
      </div>
    );
  }
}
