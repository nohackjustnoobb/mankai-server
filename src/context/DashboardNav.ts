import { type LinkProps } from "@tanstack/react-router";
import { createContext, useContext } from "react";

export type NavItem = {
  label: string;
} & Pick<LinkProps, "to" | "params">;

export type DashboardNavContextValue = {
  items: NavItem[];
  setItems: (items: NavItem[]) => void;
};

export const DashboardNavContext = createContext<DashboardNavContextValue>({
  items: [],
  setItems: () => {},
});

export function useDashboardNav(): DashboardNavContextValue {
  return useContext(DashboardNavContext);
}
