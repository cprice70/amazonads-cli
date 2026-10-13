import { describe, it, expect } from "vitest";
import { escapeHtml, listenErrorMessage } from "../../commands/auth.js";

describe("escapeHtml", () => {
  it("neutralises markup in values echoed to the callback page", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'q'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;"
    );
  });
});

describe("listenErrorMessage", () => {
  it("explains a port clash in terms the user can act on", () => {
    const err = Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" });
    expect(listenErrorMessage(err, 3000)).toMatch(/port 3000.*in use/i);
  });

  it("passes other errors through", () => {
    expect(listenErrorMessage(new Error("boom"), 3000)).toBe("boom");
  });
});
