import type { SVGProps } from "react";

/**
 * Product icons drawn on lucide's grid (24px viewBox, 2px round stroke,
 * `currentColor`), so they sit in the dock beside lucide icons and take the same
 * `className` sizing and colour.
 */
function ProductIcon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/**
 * The Mpillow outline: `public/pillow-shape.svg` fitted to the grid, stretched
 * ~10% taller so the shoulder cut-outs still read at 20px.
 */
export function PillowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <ProductIcon {...props}>
      <path d="M15.29 6.32C14.33 6.73 13.44 7 12 7C10.56 7 9.66 6.73 8.71 6.32C7.51 5.8 5.63 5.57 4.11 6.88C2.58 8.19 1.92 10.04 2.05 12.76C2.17 15.54 3.01 17.35 4.53 17.35C6.05 17.35 5.99 16.26 6.85 15.67C7.54 15.2 8.45 15.24 8.92 15.67C9.59 16.27 9.68 16.84 9.93 17.47C10.13 17.98 10.9 18.13 11.98 18.13L12.02 18.13C13.1 18.13 13.87 17.98 14.07 17.47C14.31 16.84 14.41 16.27 15.08 15.67C15.55 15.24 16.46 15.2 17.15 15.67C18.01 16.26 17.95 17.35 19.47 17.35C20.98 17.35 21.82 15.54 21.95 12.76C22.08 10.04 21.42 8.19 19.89 6.88C18.37 5.57 16.49 5.8 15.29 6.32Z" />
    </ProductIcon>
  );
}

/** An Mbolster lying on its side: one rounded end, the other end face-on. */
export function BolsterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <ProductIcon {...props}>
      <path d="M17.5 7H6.5a5 5 0 0 0 0 10h11" />
      <ellipse cx="17.5" cy="12" rx="2.5" ry="5" />
    </ProductIcon>
  );
}
