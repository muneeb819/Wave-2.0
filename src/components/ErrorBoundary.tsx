import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

type Props = {
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = {
  hasError: boolean;
  message: string;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || "Unexpected rendering failure.",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <div className="error-boundary-fallback panel" role="alert">
        <AlertCircle />
        <h2>Studio encountered an unexpected error.</h2>
        <p>{this.state.message}</p>
        <button
          type="button"
          className="button primary"
          onClick={this.handleReset}
        >
          <RotateCcw />
          Recover Studio
        </button>
      </div>
    );
  }
}
