// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { useState } from "react";
import { NumberField } from "../src/components/number-field";

expect.extend(matchers);
afterEach(() => cleanup());

function Harness({
  initial = 1,
  min,
  max,
  integer,
  decimals,
  onCommit,
}: {
  initial?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  decimals?: number;
  onCommit?: (n: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <NumberField
      value={value}
      onChange={(n) => {
        setValue(n);
        onCommit?.(n);
      }}
      min={min}
      max={max}
      integer={integer}
      decimals={decimals}
      ariaLabel="amount"
    />
  );
}

describe("NumberField", () => {
  it("does not snap to min while user is mid-typing (regression: clearing field)", () => {
    const onCommit = vi.fn();
    render(<Harness initial={5} min={1} max={100} integer onCommit={onCommit} />);
    const input = screen.getByLabelText("amount") as HTMLInputElement;

    // User clears the field then types a new value. With the old
    // `parseInt(value) || 1` clamping, clearing would immediately snap to 1
    // and the cursor would jump.
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "42" } });
    expect(input.value).toBe("42");

    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(42);
    expect(input.value).toBe("42");
  });

  it("clamps to max only on blur, not on every keystroke", () => {
    const onCommit = vi.fn();
    render(<Harness initial={1} min={1} max={50} integer onCommit={onCommit} />);
    const input = screen.getByLabelText("amount") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "999" } });
    expect(input.value).toBe("999"); // intermediate value preserved
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(50);
    expect(input.value).toBe("50");
  });

  it("restores last good value when user blurs an empty field", () => {
    render(<Harness initial={7} min={0} integer />);
    const input = screen.getByLabelText("amount") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input.value).toBe("7");
  });

  it("supports decimal values like 33.3", () => {
    const onCommit = vi.fn();
    render(<Harness initial={0} min={0} max={100} decimals={1} onCommit={onCommit} />);
    const input = screen.getByLabelText("amount") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "33.3" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(33.3);
  });

  it("escape key restores the last committed value", () => {
    render(<Harness initial={10} min={0} integer />);
    const input = screen.getByLabelText("amount") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("10");
  });

  it("commits on Enter key", () => {
    const onCommit = vi.fn();
    render(<Harness initial={1} min={1} max={100} integer onCommit={onCommit} />);
    const input = screen.getByLabelText("amount") as HTMLInputElement;

    input.focus();
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // Enter blurs the input, blur commits.
    expect(onCommit).toHaveBeenCalledWith(25);
  });
});
