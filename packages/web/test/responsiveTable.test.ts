import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResponsiveTable } from "../src/components/ResponsiveTable";

function render(direction: boolean) {
  return renderToStaticMarkup(h(ResponsiveTable, { primaryColumn: 1, "aria-label": "Transactions" },
    h("thead", null, h("tr", null, h("th", null, "#"), h("th", null, h("span", null, "Transaction")), direction && h("th", null, "Direction"), h("th", null, "Status"))),
    h("tbody", null, h(Fragment, null, h("tr", { "aria-selected": true }, h("td", null, "1"), h("td", null, h("a", { href: "#/transactions/0x123" }, "0x123")), direction && h("td", null, "In"), h("td", null, "Success"))))));
}
describe("responsive records", () => {
  it("keeps labels aligned with conditional address-history columns", () => {
    for (const direction of [true, false]) {
      const html = render(direction);
      expect(html).toContain('data-label="Status">Success');
      expect(html.includes('data-label="Direction">In')).toBe(direction);
      expect(html).toContain('data-label="Transaction" data-primary="true"');
      expect(html).toContain('href="#/transactions/0x123"');
      expect(html).toContain('aria-selected="true" role="row"');
      expect(html).toContain('aria-label="Transactions" role="table"');
      expect(html).toContain('role="columnheader" scope="col"');
    }
  });
  it("does not mislabel full-width loading or empty states as a record", () => {
    const html = renderToStaticMarkup(h(ResponsiveTable, null,
      h("thead", null, h("tr", null, h("th", null, "Contract"), h("th", null, "Calls"))),
      h("tbody", null, h("tr", null, h("td", { colSpan: 2 }, "No contracts found")))));
    expect(html).toContain('data-wide="true">No contracts found');
    expect(html).not.toContain('data-primary');
    expect(html).not.toContain('data-label');
  });
});
