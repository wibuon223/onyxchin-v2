export const DOCS_URL = "https://onyxchin-docs.onrender.com";

export interface NavLinkItem {
  to: string;
  label: string;
  end?: boolean;
}

export const NAV_LINKS: NavLinkItem[] = [
  { to: "/", label: "Beranda", end: true },
  { to: "/browse", label: "Jelajah" },
];
