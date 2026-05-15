import { render, screen } from "@testing-library/react";
import { TimelineChart } from "../TimelineChart";
import { createMockFinding } from "../../test/helpers";

describe("TimelineChart", () => {
  it("renders 'No commit date data' when no findings have commit_date", () => {
    const findings = [createMockFinding({ commit_date: null })];
    render(<TimelineChart findings={findings} />);
    expect(screen.getByText("No commit date data available")).toBeInTheDocument();
  });

  it("renders 'No commit date data' when findings array is empty", () => {
    render(<TimelineChart findings={[]} />);
    expect(screen.getByText("No commit date data available")).toBeInTheDocument();
  });

  it("renders chart (does not show empty state) when findings have commit_date", () => {
    const findings = [
      createMockFinding({ commit_date: "2024-03-15T00:00:00Z" }),
      createMockFinding({ id: "f-2", commit_date: "2024-04-20T00:00:00Z" }),
    ];
    render(<TimelineChart findings={findings} />);
    // When data exists, the empty state should not be shown
    expect(screen.queryByText("No commit date data available")).not.toBeInTheDocument();
  });

  it("buckets findings by month — does not show empty state with mixed months", () => {
    const findings = [
      createMockFinding({ commit_date: "2024-03-15T00:00:00Z" }),
      createMockFinding({ id: "f-2", commit_date: "2024-03-28T00:00:00Z" }),
      createMockFinding({ id: "f-3", commit_date: "2024-04-10T00:00:00Z" }),
    ];
    render(<TimelineChart findings={findings} />);
    // Multiple months of data → not empty
    expect(screen.queryByText("No commit date data available")).not.toBeInTheDocument();
  });
});
