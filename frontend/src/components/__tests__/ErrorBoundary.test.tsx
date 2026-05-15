import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ErrorBoundary } from "../ErrorBoundary";

// Suppress React's error boundary console output in tests
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("test error message");
  return <div>child content</div>;
}

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    wrap(
      <ErrorBoundary>
        <div>child content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("renders fallback UI when a child throws", () => {
    wrap(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
  });

  it("displays the error message in a code block", () => {
    wrap(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("test error message")).toBeInTheDocument();
  });

  it('"Try Again" resets error state and re-renders children', async () => {
    const user = userEvent.setup();
    // Use a mutable ref to control whether the child throws
    let shouldThrow = true;
    function ControlledThrower() {
      if (shouldThrow) throw new Error("test error");
      return <div>child content</div>;
    }

    wrap(
      <ErrorBoundary>
        <ControlledThrower />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Stop throwing before resetting the boundary
    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it('"Back to Home" links to "/"', () => {
    wrap(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );
    const link = screen.getByRole("link", { name: /back to home/i });
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders custom fallback prop instead of default UI", () => {
    wrap(
      <ErrorBoundary fallback={<div>custom fallback</div>}>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("custom fallback")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });
});
