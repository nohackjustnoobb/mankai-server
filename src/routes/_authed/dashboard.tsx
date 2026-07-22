import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, LogOut, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import DropdownSelector from "#/components/DropdownSelector.tsx";
import SearchBar from "#/components/SearchBar.tsx";
import ThemeToggle from "#/components/ThemeToggle";
import { useNotification } from "#/components/notifications/useNotification";
import {
  DashboardNavContext,
  type DashboardNavContextValue,
  type NavItem,
} from "#/context/DashboardNav";
import UpsertUserModal from "#/modals/UpsertUserModal.tsx";
import UpsertMangaModal from "#/modals/UpsertMangaModal.tsx";
import { logoutFn } from "#/utils/auth.functions";

import styles from "./dashboard.module.scss";

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { notify } = useNotification();
  const logout = useServerFn(logoutFn);
  const location = useLocation();
  const navigate = useNavigate();
  const [showCreateManga, setShowCreateManga] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [navItems, setNavItems] = useState<NavItem[]>([]);
  const { user } = Route.useRouteContext();

  const isUserSection = location.pathname.startsWith("/dashboard/user");
  const isAdmin = user.role === "admin";

  const searchParams = useSearch({ strict: false });
  const activeSearch =
    typeof searchParams?.search === "string" ? searchParams.search.trim() : "";

  function clearSearch() {
    const { search: _omit, ...rest } = searchParams;
    navigate({
      to: isUserSection ? "/dashboard/user" : "/dashboard",
      search: rest,
    });
  }

  const navContextValue = useMemo<DashboardNavContextValue>(
    () => ({ items: navItems, setItems: setNavItems }),
    [navItems],
  );

  async function handleLogout() {
    try {
      await logout();
    } catch (error) {
      notify.failed("Could not log out. Please try again.", {
        title: "Logout failed",
      });
      console.error(error);
    }
  }

  return (
    <div className={styles.dashboard}>
      <header>
        <div className={styles.content}>
          <div className={styles.topbar}>
            <Link to="/dashboard" className={styles.brand}>
              <img src="/icon.png" alt="Mankai" className={styles.icon} />
              <span className={styles.title}>Mankai</span>
            </Link>

            <SearchBar kind={isUserSection ? "user" : "manga"} />

            <div className={styles.actions}>
              <ThemeToggle />
              <button
                type="button"
                className={styles.logoutButton}
                onClick={handleLogout}
                title="Log out"
              >
                <LogOut size={16} />
                <span className={styles.label}>Log out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className={styles.content}>
        <DashboardNavContext.Provider value={navContextValue}>
          <nav className={styles.nav}>
            <div className={styles.breadcrumb}>
              <DropdownSelector
                options={[
                  {
                    value: "manga",
                    label: "Manga",
                  },
                  {
                    value: "user",
                    label: "User",
                  },
                ]}
                value={
                  location.pathname.startsWith("/dashboard/user")
                    ? "user"
                    : "manga"
                }
                onChange={(value) => {
                  navigate({
                    to: value === "user" ? "/dashboard/user" : "/dashboard",
                  });
                }}
              />
              {navItems.length > 0 && (
                <ul className={styles.breadcrumbItems}>
                  {navItems.map((item, index) => (
                    <li
                      key={`${item.label}-${index}`}
                      className={styles.breadcrumbItem}
                    >
                      <ChevronRight
                        size={14}
                        className={styles.breadcrumbSeparator}
                      />
                      {item.to ? (
                        <Link
                          to={item.to}
                          params={item.params}
                          className={styles.breadcrumbLink}
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <span className={styles.breadcrumbText}>
                          {item.label}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {activeSearch && (
                <div className={styles.searchLabel}>
                  <span className={styles.searchLabelText}>Search:</span>
                  <span className={styles.searchLabelQuery}>
                    {activeSearch}
                  </span>
                  <button
                    type="button"
                    className={styles.clearButton}
                    onClick={clearSearch}
                    title="Clear search"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
            <button
              className={styles.createButton}
              type="button"
              disabled={isUserSection && !isAdmin}
              onClick={() =>
                isUserSection
                  ? setShowCreateUser(true)
                  : setShowCreateManga(true)
              }
            >
              <Plus size={18} />
              {isUserSection ? "Create User" : "Create Manga"}
            </button>
          </nav>
          <Outlet />
        </DashboardNavContext.Provider>
      </main>

      {showCreateManga && (
        <UpsertMangaModal
          onClose={() => setShowCreateManga(false)}
          onSaved={(id) =>
            navigate({
              to: "/dashboard/$mangaId",
              params: { mangaId: id },
            })
          }
        />
      )}

      {showCreateUser && (
        <UpsertUserModal onClose={() => setShowCreateUser(false)} />
      )}
    </div>
  );
}
