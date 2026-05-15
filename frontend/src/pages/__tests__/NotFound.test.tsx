import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotFound } from "../NotFound";

function renderNotFound() {
  return render(
    <MemoryRouter>
      <NotFound />
    </MemoryRouter>
  );
}

describe("NotFound", () => {
  it("renders the 404 heading", () => {
    renderNotFound();
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders a descriptive message", () => {
    renderNotFound();
    expect(
      screen.getByText(/The page you're looking for doesn't exist/i)
    ).toBeInTheDocument();
  });

  it("has a link back to home", () => {
    renderNotFound();
    const link = screen.getByRole("link", { name: /back to home/i });
    expect(link).toHaveAttribute("href", "/");
  });

  it("applies Tokyo Night theme classes", () => {
    const { container } = renderNotFound();
    // Root wrapper has bg-tokyo-bg
    expect(container.firstChild).toHaveClass("bg-tokyo-bg");
    // 404 heading has text-tokyo-red
    const heading = screen.getByText("404");
    expect(heading).toHaveClass("text-tokyo-red");
  });
});
