import React, { useState, useEffect } from "react";
import { getUsers, createUser, deleteUser, type User } from "../utils/user";

import "./Home.css"; // We can reuse Home.css or split it if needed, reusing for now as it contains relevant styles

const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);

    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    loadUsers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const loadUsers = async (pageNum: number = 1) => {
    try {
      setLoading(true);
      setError(null);

      const fetchedUsers = await getUsers(pageNum, debouncedSearch);

      setUsers(fetchedUsers);
      setPage(pageNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail.trim() || !newUserPassword.trim()) {
      setError("Email and password are required");
      return;
    }

    try {
      setCreating(true);
      setError(null);

      await createUser(newUserEmail.trim(), newUserPassword);

      setNewUserEmail("");
      setNewUserPassword("");
      setShowCreateForm(false);

      // Reload users to show the new user
      await loadUsers(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to delete user "${userEmail}"?`)) {
      return;
    }

    try {
      setError(null);
      await deleteUser(userId);
      // Reload users to reflect the deletion
      await loadUsers(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const getInitials = (email: string) => {
    return email.substring(0, 1).toUpperCase();
  };

  return (
    <div className="user-management-container">
      <header className="dashboard-header">
        <div>
          <h2 className="home-title text-gradient">User Management</h2>
          <p style={{ margin: 0, opacity: 0.6 }}>
            Manage access and permissions
          </p>
        </div>

        <div className="header-actions">
          <button
            className="btn-secondary"
            onClick={() => loadUsers(page)}
            disabled={loading}
            title="Refresh Users"
          >
            Refresh
          </button>
          <button
            className={showCreateForm ? "btn-secondary" : "btn"}
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? "Close Form" : "Create User"}
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner bounce-in">
          <span>⚠️</span> {error}
        </div>
      )}

      {showCreateForm && (
        <div className="create-user-section glass-panel slide-down">
          <form className="create-form-inner" onSubmit={handleCreateUser}>
            <div className="create-form-header">
              <h3>Create New User</h3>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn" disabled={creating}>
                  {creating ? "Creating..." : "Create User"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="search-box">
        <input
          type="text"
          placeholder="Search by email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="users-section">
        <div className="section-header">
          <div className="section-title">All Users</div>
          <div className="pagination">
            <button
              className="btn-secondary btn-small"
              onClick={() => loadUsers(page - 1)}
              disabled={page <= 1 || loading}
            >
              ← Prev
            </button>
            <span className="page-info">{page}</span>
            <button
              className="btn-secondary btn-small"
              onClick={() => loadUsers(page + 1)}
              disabled={loading || users.length < 50}
            >
              Next →
            </button>
          </div>
        </div>

        {loading && page === 1 ? (
          <div className="loading-state glass-panel">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="empty-state glass-panel">
            No users found. Create one to get started.
          </div>
        ) : (
          <div className="user-grid">
            {users.map((user) => (
              <div key={user.id} className="user-card glass-panel">
                <div className="card-header">
                  <div className="user-avatar">{getInitials(user.email)}</div>
                  <span
                    className={`user-role-badge ${user.isAdmin ? "admin" : ""}`}
                  >
                    {user.isAdmin ? "Admin" : "User"}
                  </span>
                </div>

                <div className="user-details">
                  <div className="user-email">{user.email}</div>
                  <div className="user-id">ID: {user.id}</div>
                </div>

                <div className="card-actions">
                  <button
                    className="btn-delete"
                    onClick={() => handleDeleteUser(user.id, user.email)}
                  >
                    Delete User
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserManagement;
