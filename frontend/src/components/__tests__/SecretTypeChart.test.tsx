import { render, screen } from "@testing-library/react";
import { SecretTypeChart } from "../SecretTypeChart";
import { createMockFinding } from "../../test/helpers";

describe("SecretTypeChart", () => {
  it("renders 'No findings' when findings array is empty", () => {
    render(<SecretTypeChart findings={[]} />);
    expect(screen.getByText("No findings")).toBeInTheDocument();
  });

  it("renders chart (does not show empty state) when findings are provided", () => {
    const findings = [
      createMockFinding({ secret_type: "AWS Access Key" }),
      createMockFinding({ id: "f-2", secret_type: "GitHub Token" }),
    ];
    render(<SecretTypeChart findings={findings} />);
    // When data exists, the "No findings" empty state should not be shown
    expect(screen.queryByText("No findings")).not.toBeInTheDocument();
  });

  it("groups findings by secret_type correctly (no empty state with multiple types)", () => {
    const findings = [
      createMockFinding({ secret_type: "AWS Access Key" }),
      createMockFinding({ id: "f-2", secret_type: "AWS Access Key" }),
      createMockFinding({ id: "f-3", secret_type: "GitHub Token" }),
    ];
    render(<SecretTypeChart findings={findings} />);
    // With grouped data, should not show empty state
    expect(screen.queryByText("No findings")).not.toBeInTheDocument();
  });
});
