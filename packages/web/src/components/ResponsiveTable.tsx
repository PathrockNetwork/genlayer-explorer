import { Children, Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode, type TableHTMLAttributes } from "react";

type Element = ReactElement<Record<string, any>>;
function elements(children: ReactNode): Element[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<Record<string, any>>(child)) return [];
    return child.type === Fragment ? elements(child.props.children) : [child];
  });
}
function label(children: ReactNode): string {
  return Children.toArray(children).map(child => isValidElement<{ children?: ReactNode }>(child)
    ? label(child.props.children) : typeof child === "string" || typeof child === "number" ? String(child) : "").join("").trim();
}

/** One semantic table: desktop columns become labelled records on narrow screens. */
export function ResponsiveTable({ children, className = "", primaryColumn = 0, ...props }:
  TableHTMLAttributes<HTMLTableElement> & { primaryColumn?: number }) {
  const sections = elements(children);
  const head = sections.find(section => section.type === "thead");
  const labels = head ? elements(head.props.children).flatMap(row => elements(row.props.children).map(cell => label(cell.props.children))) : [];
  return <table {...props} role="table" className={`responsive-table ${className}`}>
    {sections.map(section => {
      if (section.type !== "thead" && section.type !== "tbody") return section;
      const header = section.type === "thead";
      return cloneElement(section, { role: "rowgroup", children: elements(section.props.children).map(row => {
        if (row.type !== "tr") return row;
        let column = 0;
        return cloneElement(row, { role: "row", children: elements(row.props.children).map(cell => {
          const index = column; column += Number(cell.props.colSpan ?? 1);
          if (cell.type !== "th" && cell.type !== "td") return cell;
          const wide = Number(cell.props.colSpan ?? 1) > 1;
          return cloneElement(cell, header ? { role: "columnheader", scope: "col" } : {
            role: "cell", "data-label": wide ? undefined : labels[index],
            "data-primary": !wide && index === primaryColumn ? "true" : undefined,
            "data-wide": wide ? "true" : undefined,
          });
        }) });
      }) });
    })}
  </table>;
}
