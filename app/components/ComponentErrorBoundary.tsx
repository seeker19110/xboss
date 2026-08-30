"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  name?: string;
  fallback?: ReactNode;
  onReset?: () => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Component Crash Isolation Boundary cho XBoss (M81)
 * Bọc quanh các widget con phức tạp (Biểu đồ Recharts, Lưới Spreadsheet, 3D WebGL Canvas)
 * để cô lập lỗi, ngăn chặn việc sập toàn bộ trang khi một thành phần phụ gặp sự cố.
 */
export class ComponentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ComponentErrorBoundary: ${this.props.name || "Widget"}]`, error, errorInfo);
    Sentry.captureException(error, {
      tags: { componentName: this.props.name || "isolated_widget" },
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-200 flex flex-col items-center justify-center text-center gap-3 min-h-[160px]">
          <div className="p-2 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-200">
              Không thể tải thành phần {this.props.name ? `"${this.props.name}"` : ""}
            </h4>
            <p className="text-[11px] text-zinc-400 mt-1 max-w-sm">
              Đã xảy ra sự cố khi hiển thị widget này. Phần còn lại của trang vẫn hoạt động bình
              thường.
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition border border-zinc-700"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Thử lại
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ComponentErrorBoundary;
