export type UserRole =
  | "admin"
  | "loan_officer"
  | "processor"
  | "underwriter";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  loan_officer: "Loan Officer",
  processor: "Processor",
  underwriter: "Underwriter",
};

export const PAGE_ACCESS: Record<string, UserRole[]> = {
  "/dashboard": ["admin", "loan_officer", "processor", "underwriter"],
  "/applications": ["admin", "loan_officer", "processor", "underwriter"],
  "/borrowers": ["admin", "loan_officer", "processor"],
  "/underwriters": ["admin", "underwriter"],
  "/settings": ["admin"],
};
