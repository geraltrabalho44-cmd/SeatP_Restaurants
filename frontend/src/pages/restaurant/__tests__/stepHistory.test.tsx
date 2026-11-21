// Back in the browser goes back one booking step, not to the page before the booking.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useStepHistory } from "../useStepHistory";

function Steps() {
  const [step, setStep] = useState(0);
  const [held, setHeld] = useState(false);
  useStepHistory(step, held, step === 4, (target, wantHeld) => {
    setStep(target);
    setHeld(wantHeld);
  });
  return (
    <div>
      <p data-testid="where">{`${step}${held ? " held" : ""}`}</p>
      <button onClick={() => setStep(step + 1)}>next</button>
      <button onClick={() => setHeld(true)}>hold</button>
      <button onClick={() => { setStep(Math.max(0, step - 1)); setHeld(false); }}>screen back</button>
    </div>
  );
}

const here = () => screen.getByTestId("where").textContent;
const back = async () => { await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 20)); }); };
afterEach(() => { window.history.replaceState(null, "", "/"); });

describe("the browser's Back button in the booking", () => {
  it("goes back one step at a time", async () => {
    render(<Steps />);
    const start = window.history.length;
    fireEvent.click(screen.getByText("next"));
    fireEvent.click(screen.getByText("next"));
    expect(here()).toBe("2");
    expect(window.history.length).toBe(start + 2); // one entry for each step reached
    await back();
    await waitFor(() => expect(here()).toBe("1"));
    await back();
    await waitFor(() => expect(here()).toBe("0"));
  });

  it("gives a held table back when going back past it, to the table step", async () => {
    render(<Steps />);
    fireEvent.click(screen.getByText("next"));
    fireEvent.click(screen.getByText("next"));
    fireEvent.click(screen.getByText("hold"));
    expect(here()).toBe("2 held");
    await back();
    await waitFor(() => expect(here()).toBe("2"));
  });

  it("keeps the browser's entries in line when a button on the page goes back", async () => {
    render(<Steps />);
    fireEvent.click(screen.getByText("next"));
    fireEvent.click(screen.getByText("next"));
    fireEvent.click(screen.getByText("screen back"));
    await waitFor(() => expect(here()).toBe("1"));
    await back();
    await waitFor(() => expect(here()).toBe("0")); // one Back from step 1 is step 0, not the page before
  });

  it("leaves a finished booking alone: Back does not reopen its steps", async () => {
    render(<Steps />);
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByText("next"));
    expect(here()).toBe("4");
    await back();
    expect(here()).toBe("4");
  });
});
