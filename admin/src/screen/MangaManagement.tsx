import { useState, useEffect } from "react";
import {
  getMangas,
  createManga,
  deleteManga,
  Status,
  Genre,
  type Manga,
} from "../utils/manga";
import AuthImage from "../components/AuthImage";
import EditMangaModal from "../components/EditMangaModal";
import "./Home.css"; // Reuse styles

const MangaManagement = () => {
  const [mangas, setMangas] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Create Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newStatus, setNewStatus] = useState<Status>(Status.OnGoing);
  const [newDescription, setNewDescription] = useState("");

  const [newAuthors, setNewAuthors] = useState<string[]>([]);
  const [authorInput, setAuthorInput] = useState("");

  const [newGenres, setNewGenres] = useState<Genre[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<Genre | "">("");

  const [newRemarks, setNewRemarks] = useState("");
  const [newCover, setNewCover] = useState("");

  // Edit Modal State
  const [editMangaId, setEditMangaId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);

    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    loadMangas(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const loadMangas = async (pageNum: number = 1) => {
    try {
      setLoading(true);
      setError(null);

      const fetchedMangas = await getMangas(pageNum, debouncedSearch);

      setMangas(fetchedMangas);
      setPage(pageNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mangas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMangas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64 = base64String.split(",")[1];
        setNewCover(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddAuthor = () => {
    if (authorInput.trim()) {
      setNewAuthors([...newAuthors, authorInput.trim()]);
      setAuthorInput("");
    }
  };

  const handleRemoveAuthor = (index: number) => {
    setNewAuthors(newAuthors.filter((_, i) => i !== index));
  };

  const handleAddGenre = () => {
    if (selectedGenre && !newGenres.includes(selectedGenre as Genre)) {
      setNewGenres([...newGenres, selectedGenre as Genre]);
      setSelectedGenre("");
    }
  };

  const handleRemoveGenre = (index: number) => {
    setNewGenres(newGenres.filter((_, i) => i !== index));
  };

  const handleCreateManga = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setError("Title is required");
      return;
    }

    try {
      setCreating(true);
      setError(null);

      await createManga(
        newTitle.trim(),
        newStatus,
        newDescription.trim(),
        newAuthors,
        newGenres,
        newCover,
        newRemarks.trim(),
      );

      // Reset form
      setNewTitle("");
      setNewStatus(Status.OnGoing);
      setNewDescription("");
      setNewAuthors([]);
      setAuthorInput("");
      setNewGenres([]);
      setSelectedGenre("");
      setNewRemarks("");
      setNewCover("");
      setShowCreateForm(false);

      // Reload
      await loadMangas(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create manga");
    } finally {
      setCreating(false);
    }
  };

  const handleEditManga = (mangaId: string) => {
    setEditMangaId(mangaId);
    setShowEditModal(true);
  };

  const handleUpdateSuccess = async () => {
    await loadMangas(page);
  };

  const handleDeleteManga = async (mangaId: string) => {
    if (
      window.confirm(
        "Are you sure you want to delete this manga? This action cannot be undone.",
      )
    ) {
      try {
        setLoading(true);
        await deleteManga(mangaId);
        await loadMangas(page);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete manga");
        setLoading(false);
      }
    }
  };

  return (
    <>
      <div className="manga-management-container">
        <header className="dashboard-header">
          <div>
            <h2 className="home-title text-gradient">Manga Management</h2>
            <p className="page-description">Manage manga library</p>
          </div>

          <div className="header-actions">
            <button
              className="btn-secondary"
              onClick={() => loadMangas(page)}
              disabled={loading}
              title="Refresh Mangas"
            >
              Refresh
            </button>
            <button
              className={showCreateForm ? "btn-secondary" : "btn"}
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              {showCreateForm ? "Close Form" : "Create Manga"}
            </button>
          </div>
        </header>

        {error && (
          <div className="error-banner bounce-in">
            <span>⚠️</span> {error}
          </div>
        )}

        <div className="search-box">
          <input
            type="text"
            placeholder="Search mangas by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
        </div>

        {showCreateForm && (
          <div className="create-user-section glass-panel slide-down">
            <form className="create-form-inner" onSubmit={handleCreateManga}>
              <div className="create-form-header">
                <h3>Create New Manga</h3>
              </div>
              <div className="form-row wrap-start">
                <div className="form-group medium">
                  <label htmlFor="title">Title</label>
                  <input
                    type="text"
                    id="title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Manga Title"
                    required
                  />
                </div>

                <div className="form-group small">
                  <label htmlFor="status">Status</label>
                  <select
                    id="status"
                    value={newStatus}
                    onChange={(e) => setNewStatus(Number(e.target.value))}
                  >
                    <option value={Status.OnGoing}>Ongoing</option>
                    <option value={Status.Ended}>Ended</option>
                  </select>
                </div>

                <div className="form-group medium">
                  <label>Authors</label>
                  <div className="chip-input-container">
                    <input
                      type="text"
                      value={authorInput}
                      onChange={(e) => setAuthorInput(e.target.value)}
                      placeholder="Add author..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddAuthor();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleAddAuthor}
                    >
                      Add
                    </button>
                  </div>
                  <div className="chip-list">
                    {newAuthors.map((author, index) => (
                      <span key={index} className="chip">
                        {author}
                        <button
                          type="button"
                          className="chip-remove-btn"
                          onClick={() => handleRemoveAuthor(index)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="form-group medium">
                  <label>Genres</label>
                  <div className="chip-input-container">
                    <select
                      value={selectedGenre}
                      onChange={(e) =>
                        setSelectedGenre(e.target.value as Genre)
                      }
                      style={{
                        flex: 1,
                      }}
                    >
                      <option value="">Select a genre...</option>
                      {Object.values(Genre)
                        .slice(1)
                        .map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleAddGenre}
                      disabled={!selectedGenre}
                    >
                      Add
                    </button>
                  </div>
                  <div className="chip-list">
                    {newGenres.map((genre, index) => (
                      <span key={index} className="chip">
                        {genre}
                        <button
                          type="button"
                          className="chip-remove-btn"
                          onClick={() => handleRemoveGenre(index)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="form-group full">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Manga Description"
                    rows={3}
                    className="textarea-resize"
                  />
                </div>

                <div className="form-group full">
                  <label htmlFor="remarks">Remarks</label>
                  <textarea
                    id="remarks"
                    value={newRemarks}
                    onChange={(e) => setNewRemarks(e.target.value)}
                    placeholder="Manga Remarks"
                    rows={2}
                    className="textarea-resize"
                  />
                </div>

                <div className="form-group full">
                  <label htmlFor="cover">Cover Image</label>
                  <input
                    type="file"
                    id="cover"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                  {newCover && (
                    <div className="cover-preview-container">
                      <div>
                        <p className="page-description">Preview:</p>
                        <img
                          src={`data:image/webp;base64,${newCover}`}
                          alt="Cover Preview"
                          className="cover-preview-image"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-actions submit-row">
                  <button type="submit" className="btn" disabled={creating}>
                    {creating ? "Creating..." : "Create Manga"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        <div className="manga-section">
          <div className="section-header">
            <div className="section-title">All Mangas</div>
            <div className="pagination">
              <button
                className="btn-secondary btn-small"
                onClick={() => loadMangas(page - 1)}
                disabled={page <= 1 || loading}
              >
                ← Prev
              </button>
              <span className="page-info">{page}</span>
              <button
                className="btn-secondary btn-small"
                onClick={() => loadMangas(page + 1)}
                disabled={loading || mangas.length < 50}
              >
                Next →
              </button>
            </div>
          </div>

          {loading && page === 1 ? (
            <div className="loading-state glass-panel">Loading mangas...</div>
          ) : mangas.length === 0 ? (
            <div className="empty-state glass-panel">
              No mangas found. Create one to get started.
            </div>
          ) : (
            <div className="user-grid">
              {mangas.map((manga) => (
                <div key={manga.id} className="user-card glass-panel">
                  <div className="card-header">
                    {manga.cover ? (
                      <AuthImage
                        src={manga.cover}
                        alt={manga.title}
                        className="manga-cover"
                        fallback={<div className="manga-cover">No cover</div>}
                      />
                    ) : (
                      <div className="manga-cover">No cover</div>
                    )}
                  </div>

                  <div className="user-details">
                    <div className="user-email font-bold">{manga.title}</div>
                    <div className="user-id">ID: {manga.id}</div>
                  </div>

                  <div className="card-actions">
                    <button
                      className="btn-secondary"
                      onClick={() => handleEditManga(manga.id)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => handleDeleteManga(manga.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {showEditModal && editMangaId && (
        <EditMangaModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          mangaId={editMangaId}
          onUpdate={handleUpdateSuccess}
        />
      )}
    </>
  );
};

export default MangaManagement;
