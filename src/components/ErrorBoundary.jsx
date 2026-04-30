import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-screen center-all">
          <h2>Oops! Something went wrong.</h2>
          <p className="text-muted mb-4">
            An unexpected error occurred in the application.
          </p>
          <div className="glass-panel" style={{ padding: "16px", marginBottom: "24px", color: "#f87171", fontFamily: "monospace", textAlign: "left", maxWidth: "600px", overflowX: "auto" }}>
            {this.state.error?.toString()}
          </div>
          <button
            className="btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
