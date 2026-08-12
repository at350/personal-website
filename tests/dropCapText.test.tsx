import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DropCapText } from "@/components/furniture/DropCapText";

afterEach(cleanup);

describe("raster-safe drop caps", () => {
  it("keeps the styled initial in the readable text stream", () => {
    const text = "Hello from a moving page.";
    const { container } = render(
      <p>
        <DropCapText text={text} />
      </p>,
    );
    const initial = container.querySelector(".drop-cap__letter");

    expect(initial?.textContent).toBe("H");
    expect(initial?.hasAttribute("aria-hidden")).toBe(false);
    expect(container.textContent).toBe(text);
  });
});
