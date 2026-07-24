import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Link as LinkIcon,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { useNotification } from "#/components/notifications/useNotification";
import ConfirmModal from "#/modals/ConfirmModal.tsx";
import UpsertUserModal, {
  type UpsertUserModalValue,
} from "#/modals/UpsertUserModal.tsx";
import { USER_CREATED_EVENT, USER_UPDATED_EVENT } from "#/utils/events.ts";
import {
  fetchUsersFn,
  getApiUrlFn,
  regenerateApiUrlFn,
  type UserListItem,
} from "#/utils/user.functions";

import styles from "./index.module.scss";

const ROLE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
] as const;

const ACTIVE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

type RoleFilter = (typeof ROLE_OPTIONS)[number]["value"];
type ActiveFilter = (typeof ACTIVE_OPTIONS)[number]["value"];

const userSearchSchema = z.object({
  role: z.preprocess(
    (value) => (value ? value : undefined),
    z.enum(["all", "admin", "member"]).catch("all").optional(),
  ),
  active: z.preprocess(
    (value) => (value ? value : undefined),
    z.enum(["all", "active", "inactive"]).catch("all").optional(),
  ),
  search: z.preprocess((value) => {
    if (!value) return undefined;
    const normalized = String(value).trim();
    return normalized || undefined;
  }, z.string().optional()),
  page: z.preprocess((value) => {
    if (!value) return undefined;
    const rawPage = Number(value);
    return Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  }, z.number().optional()),
});

export const Route = createFileRoute("/_authed/dashboard/user/")({
  validateSearch: userSearchSchema,
  loader: async () => {
    const apiUrl = await getApiUrlFn();
    return { apiUrl };
  },
  component: RouteComponent,
});

function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function RouteComponent() {
  const router = useRouter();
  const { notify } = useNotification();
  const { apiUrl } = Route.useLoaderData();
  const { user } = Route.useRouteContext();
  const isAdmin = user.role === "admin";

  const fetchUsers = useServerFn(fetchUsersFn);
  const regenerateApiUrl = useServerFn(regenerateApiUrlFn);

  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UpsertUserModalValue | null>(
    null,
  );
  // null = closed, "self" = regenerating own URL, otherwise target user id.
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const navigate = useNavigate();
  const { role = "all", active = "all", search, page = 1 } = Route.useSearch();

  const [items, setItems] = useState<UserListItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  async function handleCopyOwn() {
    if (!apiUrl.ok) return;
    try {
      await navigator.clipboard.writeText(apiUrl.url);
      setCopied(true);
      notify.success("API URL copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
      notify.failed("Could not copy to clipboard.", { title: "Error" });
    }
  }

  async function handleCopyRow(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      notify.success("API URL copied to clipboard.");
      setTimeout(
        () => setCopiedId((curr) => (curr === id ? null : curr)),
        2000,
      );
    } catch (err) {
      console.error(err);
      notify.failed("Could not copy to clipboard.", { title: "Error" });
    }
  }

  async function handleRegenerate() {
    const targetId =
      regeneratingId === "self" ? undefined : (regeneratingId ?? undefined);
    try {
      const result = await regenerateApiUrl({ data: { id: targetId } });
      if (result.ok) {
        notify.success("API URL regenerated.");
        setRegeneratingId(null);
        if (!targetId || targetId === user.id) {
          void router.invalidate();
        }
        window.dispatchEvent(new CustomEvent(USER_UPDATED_EVENT));
      } else {
        notify.failed(result.error, { title: "Could not regenerate API URL" });
      }
    } catch (err) {
      console.error(err);
      notify.failed("Could not regenerate API URL. Please try again.", {
        title: "Error",
      });
    }
  }

  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;
    setLoading(true);

    fetchUsers({
      data: {
        role: role === "all" ? undefined : role,
        isActive: active === "all" ? undefined : active === "active",
        search,
        page,
      },
    })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotalPages(result.totalPages);
        if (result.page < page) {
          navigate({
            to: "/dashboard/user",
            search: { role, active, search, page: result.page },
          });
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          notify.failed("Could not load users.", { title: "Error" });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isAdmin,
    role,
    active,
    search,
    page,
    refreshKey,
    fetchUsers,
    navigate,
    notify,
  ]);

  useEffect(() => {
    if (!isAdmin) return;
    function handleUserChanged() {
      setRefreshKey((k) => k + 1);
    }
    window.addEventListener(USER_CREATED_EVENT, handleUserChanged);
    window.addEventListener(USER_UPDATED_EVENT, handleUserChanged);
    return () => {
      window.removeEventListener(USER_CREATED_EVENT, handleUserChanged);
      window.removeEventListener(USER_UPDATED_EVENT, handleUserChanged);
    };
  }, [isAdmin]);

  return (
    <div className={styles.container}>
      {apiUrl.ok ? (
        <div className={styles.apiCard}>
          <div className={styles.apiCardHeader}>
            <div className={styles.apiCardTitle}>
              <LinkIcon size={16} className={styles.apiCardIcon} />
              <span>App URL</span>
            </div>
            <div className={styles.apiCardActions}>
              <button
                type="button"
                className={`outlineButton ${styles.copyButton}`}
                onClick={() => setRegeneratingId("self")}
              >
                <RefreshCw size={16} />
                <span>Regenerate</span>
              </button>
              <button
                type="button"
                className={`outlineButton ${styles.copyButton}`}
                onClick={handleCopyOwn}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>
          <p className={styles.apiDescription}>
            This single URL powers both — paste it into{" "}
            <strong>HTTPPlugin</strong> to browse manga, or{" "}
            <strong>HTTPEngine</strong> to sync.
          </p>
          <code className={styles.apiUrl}>{apiUrl.url}</code>
        </div>
      ) : (
        <div className={styles.error}>{apiUrl.error}</div>
      )}

      {isAdmin && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.filters}>
              <label className={styles.field}>
                <span className={styles.label}>Role</span>
                <select
                  className={styles.filter}
                  value={role}
                  onChange={(e) => {
                    const next = e.target.value as RoleFilter;
                    navigate({
                      to: "/dashboard/user",
                      search: { role: next, active, search, page: 1 },
                    });
                  }}
                  title="Role"
                  disabled={loading}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Status</span>
                <select
                  className={styles.filter}
                  value={active}
                  onChange={(e) => {
                    const next = e.target.value as ActiveFilter;
                    navigate({
                      to: "/dashboard/user",
                      search: { role, active: next, search, page: 1 },
                    });
                  }}
                  title="Status"
                  disabled={loading}
                >
                  {ACTIVE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.navButton}
                onClick={() =>
                  navigate({
                    to: "/dashboard/user",
                    search: {
                      role,
                      active,
                      search,
                      page: Math.max(1, page - 1),
                    },
                  })
                }
                disabled={page <= 1 || loading}
                title="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className={styles.pageIndicator}>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className={styles.navButton}
                onClick={() =>
                  navigate({
                    to: "/dashboard/user",
                    search: {
                      role,
                      active,
                      search,
                      page: Math.min(totalPages, page + 1),
                    },
                  })
                }
                disabled={page >= totalPages || loading}
                title="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {loading && items.length === 0 ? (
            <div className={styles.state}>Loading users…</div>
          ) : items.length === 0 ? (
            <div className={styles.state}>No users found.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <colgroup>
                  <col className={styles.colEmail} />
                  <col className={styles.colRole} />
                  <col className={styles.colStatus} />
                  <col className={styles.colCreated} />
                  <col className={styles.colApiUrl} />
                  <col className={styles.colActions} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th className={styles.createdCell}>Created</th>
                    <th>API URL</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((u) => {
                    const apiUrl = u.apiUrl;
                    return (
                      <tr key={u.id}>
                        <td className={styles.email}>{u.email}</td>
                        <td>
                          <span
                            className={`${styles.badge} ${
                              u.role === "admin" ? styles.admin : ""
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`${styles.badge} ${
                              u.isActive ? styles.active : ""
                            }`}
                          >
                            {u.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td
                          className={`${styles.created} ${styles.createdCell}`}
                        >
                          {formatDate(u.createdAt)}
                        </td>
                        <td>
                          {apiUrl ? (
                            <div className={styles.rowApiUrl}>
                              <code
                                className={styles.apiUrlValue}
                                title={apiUrl}
                              >
                                {apiUrl}
                              </code>
                              <button
                                type="button"
                                className={`iconButton ${styles.copyButton}`}
                                onClick={() => handleCopyRow(u.id, apiUrl)}
                                title="Copy API URL"
                              >
                                {copiedId === u.id ? (
                                  <Check size={16} />
                                ) : (
                                  <Copy size={16} />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className={styles.apiUrlValue}>-</span>
                          )}
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className="iconButton"
                              onClick={() => setRegeneratingId(u.id)}
                              disabled={u.role === "admin"}
                              title={
                                u.role === "admin"
                                  ? "Admin accounts cannot be modified"
                                  : "Regenerate API URL"
                              }
                            >
                              <RefreshCw size={16} />
                            </button>
                            <button
                              type="button"
                              className="iconButton"
                              onClick={() =>
                                setEditingUser({
                                  id: u.id,
                                  email: u.email,
                                  isActive: u.isActive,
                                })
                              }
                              disabled={u.role === "admin"}
                              title={
                                u.role === "admin"
                                  ? "Admin accounts cannot be modified"
                                  : "Edit user"
                              }
                            >
                              <Pencil size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editingUser && (
        <UpsertUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
        />
      )}

      {regeneratingId && (
        <ConfirmModal
          title="Regenerate API URL"
          message={
            <>
              This will issue a new API URL and invalidate the current one. Any
              clients using the old URL will need to be updated. This action
              cannot be undone.
            </>
          }
          confirmLabel="Regenerate"
          loadingLabel="Regenerating…"
          variant="danger"
          onConfirm={handleRegenerate}
          onClose={() => setRegeneratingId(null)}
        />
      )}
    </div>
  );
}
