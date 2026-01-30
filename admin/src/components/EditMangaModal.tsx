import { useState, useEffect } from "react";
import {
  getMangaDetail,
  updateManga,
  createChapterGroup,
  deleteChapterGroup,
  createChapter,
  deleteChapter,
  addChapterImages,
  deleteChapterImage,
  Status,
  Genre,
  type AdminChapterGroup,
} from "../utils/manga";
import "../screen/Home.css"; // Reuse styles
import "./EditMangaModal.css";
import AuthImage from "./AuthImage";

interface EditMangaModalProps {
  isOpen: boolean;
  onClose: () => void;
  mangaId: string;
  onUpdate: () => void;
}

const EditMangaModal = ({
  isOpen,
  onClose,
  mangaId,
  onUpdate,
}: EditMangaModalProps) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "chapters">("details");

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Status>(Status.OnGoing);
  const [description, setDescription] = useState("");
  const [authors, setAuthors] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [remarks, setRemarks] = useState("");
  const [cover, setCover] = useState("");
  const [currentCoverUrl, setCurrentCoverUrl] = useState<string | undefined>(
    undefined,
  );
  const [chapterGroups, setChapterGroups] = useState<AdminChapterGroup[]>([]);

  const [authorInput, setAuthorInput] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<Genre | "">("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const loadMangaDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        const manga = await getMangaDetail(mangaId);

        setTitle(manga.title || "");
        setStatus(manga.status || Status.OnGoing);
        setDescription(manga.description || "");
        setAuthors(manga.authors || []);
        setGenres(manga.genres || []);
        setRemarks(manga.remarks || "");
        setCurrentCoverUrl(manga.cover);
        setChapterGroups(manga.chapterGroups || []);
        setCover("");

        if (manga.chapterGroups?.length > 0) {
          setSelectedGroupId(manga.chapterGroups[0].id);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load manga details",
        );
      } finally {
        setLoading(false);
      }
    };

    if (isOpen && mangaId) {
      loadMangaDetails();
      setActiveTab("details");
    }
  }, [isOpen, mangaId]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64 = base64String.split(",")[1];
        setCover(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddAuthor = () => {
    if (authorInput.trim()) {
      setAuthors([...authors, authorInput.trim()]);
      setAuthorInput("");
    }
  };

  const handleRemoveAuthor = (index: number) => {
    setAuthors(authors.filter((_, i) => i !== index));
  };

  const handleAddGenre = () => {
    if (selectedGenre && !genres.includes(selectedGenre)) {
      setGenres([...genres, selectedGenre]);
      setSelectedGenre("");
    }
  };

  const handleRemoveGenre = (index: number) => {
    setGenres(genres.filter((_, i) => i !== index));
  };

  // Chapter Group Handlers
  const handleAddGroup = async () => {
    const title = prompt("Enter Chapter Group Title:");
    if (!title) return;

    try {
      const maxSeq = Math.max(0, ...chapterGroups.map((g) => g.sequence));
      const group = await createChapterGroup(mangaId, title, maxSeq + 1);
      setChapterGroups([...chapterGroups, group]);
      setSelectedGroupId(group.id);
    } catch (err) {
      console.error(err);
      alert("Failed to create group");
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this group? All chapters in it will be lost.",
      )
    )
      return;

    try {
      await deleteChapterGroup(mangaId, groupId);
      const newGroups = chapterGroups.filter((g) => g.id !== groupId);
      setChapterGroups(newGroups);
      if (selectedGroupId === groupId) {
        setSelectedGroupId(newGroups.length > 0 ? newGroups[0].id : null);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete group");
    }
  };

  const handleUpdateGroup = (
    groupId: string,
    field: "title" | "sequence",
    value: string | number,
  ) => {
    setChapterGroups(
      chapterGroups.map((g) =>
        g.id === groupId ? { ...g, [field]: value } : g,
      ),
    );
  };

  // Chapter Handlers
  const handleAddChapter = async (groupId: string) => {
    const title = prompt("Enter Chapter Title:");
    if (!title) return;

    try {
      const group = chapterGroups.find((g) => g.id === groupId);
      if (!group) return;

      const maxSeq = Math.max(0, ...group.chapters.map((c) => c.sequence));
      const chapter = await createChapter(mangaId, groupId, title, maxSeq + 1);

      setChapterGroups(
        chapterGroups.map((g) =>
          g.id === groupId ? { ...g, chapters: [...g.chapters, chapter] } : g,
        ),
      );
    } catch (err) {
      console.error(err);
      alert("Failed to create chapter");
    }
  };

  const handleDeleteChapter = async (groupId: string, chapterId: string) => {
    if (!confirm("Are you sure you want to delete this chapter?")) return;

    try {
      await deleteChapter(mangaId, groupId, chapterId);
      setChapterGroups(
        chapterGroups.map((g) =>
          g.id === groupId
            ? {
                ...g,
                chapters: g.chapters.filter((c) => c.id !== chapterId),
              }
            : g,
        ),
      );
    } catch (err) {
      console.error(err);
      alert("Failed to delete chapter");
    }
  };

  const handleUpdateChapter = (
    groupId: string,
    chapterId: string,
    field: "title" | "sequence" | "locked",
    value: string | number | boolean,
  ) => {
    setChapterGroups(
      chapterGroups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              chapters: g.chapters.map((c) =>
                c.id === chapterId ? { ...c, [field]: value } : c,
              ),
            }
          : g,
      ),
    );
  };

  const handleAddChapterImages = async (
    groupId: string,
    chapterId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const base64Images: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64String = reader.result as string;
            resolve(base64String.split(",")[1]);
          };
          reader.readAsDataURL(file);
        });
        base64Images.push(base64);
      }

      await addChapterImages(mangaId, groupId, chapterId, base64Images);

      // Refresh data locally
      const manga = await getMangaDetail(mangaId);
      setChapterGroups(manga.chapterGroups || []);
    } catch (err) {
      console.error(err);
      alert("Failed to upload images");
    }
  };

  const handleDeleteChapterImage = async (
    groupId: string,
    chapterId: string,
    imageId: string,
  ) => {
    if (!confirm("Delete this image?")) return;
    try {
      await deleteChapterImage(mangaId, groupId, chapterId, imageId);
      const manga = await getMangaDetail(mangaId);
      setChapterGroups(manga.chapterGroups || []);
    } catch (err) {
      console.error(err);
      alert("Failed to delete image");
    }
  };

  const handleMoveImage = (
    groupId: string,
    chapterId: string,
    imageId: string,
    direction: "left" | "right",
  ) => {
    setChapterGroups(
      chapterGroups.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          chapters: g.chapters.map((c) => {
            if (c.id !== chapterId) return c;
            if (!c.images) return c;

            const sortedImages = [...c.images].sort(
              (a, b) => a.sequence - b.sequence,
            );
            const index = sortedImages.findIndex((img) => img.id === imageId);
            if (index === -1) return c;

            if (direction === "left" && index > 0) {
              const tempSeq = sortedImages[index].sequence;
              sortedImages[index].sequence = sortedImages[index - 1].sequence;
              sortedImages[index - 1].sequence = tempSeq;
            } else if (
              direction === "right" &&
              index < sortedImages.length - 1
            ) {
              const tempSeq = sortedImages[index].sequence;
              sortedImages[index].sequence = sortedImages[index + 1].sequence;
              sortedImages[index + 1].sequence = tempSeq;
            }

            return { ...c, images: sortedImages };
          }),
        };
      }),
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await updateManga(mangaId, {
        title: title.trim(),
        status,
        description: description.trim(),
        authors,
        genres,
        remarks: remarks.trim(),
        cover: cover || undefined,
        chapterGroups,
      });

      onUpdate();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update manga");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const selectedGroup = chapterGroups.find((g) => g.id === selectedGroupId);

  return (
    <div className="modal-overlay">
      <div className="edit-manga-modal glass-panel slide-down">
        <div className="modal-header">
          <div className="modal-title-row">
            <h3>Edit Manga</h3>
            <button onClick={onClose} className="modal-close-btn">
              ×
            </button>
          </div>

          <div className="modal-tabs">
            <button
              type="button"
              className={`tab-btn ${activeTab === "details" ? "active" : ""}`}
              onClick={() => setActiveTab("details")}
            >
              Details
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "chapters" ? "active" : ""}`}
              onClick={() => setActiveTab("chapters")}
            >
              Chapters & Groups
            </button>
          </div>
        </div>

        <div className="modal-content-scroll">
          {loading ? (
            <div className="loading-container">Loading details...</div>
          ) : (
            <form onSubmit={handleSave}>
              {error && (
                <div className="error-banner" style={{ marginBottom: "16px" }}>
                  <span>⚠️</span> {error}
                </div>
              )}

              {activeTab === "details" ? (
                <div className="form-row">
                  <div className="form-group medium">
                    <label htmlFor="edit-title">Title</label>
                    <input
                      type="text"
                      id="edit-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group small">
                    <label htmlFor="edit-status">Status</label>
                    <select
                      id="edit-status"
                      value={status}
                      onChange={(e) => setStatus(Number(e.target.value))}
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
                      {authors.map((author, index) => (
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
                      {genres.map((g, index) => (
                        <span key={index} className="chip">
                          {g}
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
                    <label htmlFor="edit-description">Description</label>
                    <textarea
                      id="edit-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="textarea-resize"
                    />
                  </div>

                  <div className="form-group full">
                    <label htmlFor="edit-remarks">Remarks</label>
                    <textarea
                      id="edit-remarks"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      rows={2}
                      className="textarea-resize"
                    />
                  </div>

                  <div className="form-group full">
                    <label htmlFor="edit-cover">Cover Image</label>
                    <input
                      type="file"
                      id="edit-cover"
                      accept="image/*"
                      onChange={handleImageUpload}
                    />
                    <div className="cover-preview-container">
                      {currentCoverUrl && !cover && (
                        <div>
                          <p style={{ fontSize: "0.8em", opacity: 0.7 }}>
                            Current:
                          </p>
                          <AuthImage
                            src={currentCoverUrl}
                            alt="Current Cover"
                            className="cover-preview-image"
                          />
                        </div>
                      )}
                      {cover && (
                        <div>
                          <p style={{ fontSize: "0.8em", opacity: 0.7 }}>
                            New:
                          </p>
                          <img
                            src={`data:image/webp;base64,${cover}`}
                            alt="New Cover Preview"
                            className="cover-preview-image"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="chapters-editor">
                  <div className="chapter-groups-scroller">
                    {chapterGroups.map((group) => (
                      <div
                        key={group.id}
                        onClick={() => setSelectedGroupId(group.id)}
                        className={`group-chip ${selectedGroupId === group.id ? "active" : ""}`}
                      >
                        {group.title}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn-secondary add-group-btn"
                      onClick={handleAddGroup}
                    >
                      +
                    </button>
                  </div>

                  {selectedGroup && (
                    <div className="chapter-group-details">
                      <div className="group-header-row">
                        <div
                          className="form-group"
                          style={{ flex: 1, marginBottom: 0 }}
                        >
                          <label>Group Title</label>
                          <input
                            type="text"
                            value={selectedGroup.title}
                            onChange={(e) =>
                              handleUpdateGroup(
                                selectedGroup.id,
                                "title",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                        <div
                          className="form-group"
                          style={{
                            width: "100px",
                            flexShrink: 0,
                            marginBottom: 0,
                          }}
                        >
                          <label>Sequence</label>
                          <input
                            type="number"
                            value={selectedGroup.sequence}
                            onChange={(e) =>
                              handleUpdateGroup(
                                selectedGroup.id,
                                "sequence",
                                Number(e.target.value),
                              )
                            }
                          />
                        </div>
                        <button
                          type="button"
                          className="btn-secondary delete-group-btn"
                          onClick={() => handleDeleteGroup(selectedGroup.id)}
                        >
                          Delete Group
                        </button>
                      </div>

                      <div className="chapters-header">
                        <h4>Chapters ({selectedGroup.chapters.length})</h4>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleAddChapter(selectedGroup.id)}
                        >
                          Add Chapter
                        </button>
                      </div>

                      <div className="chapters-list">
                        {selectedGroup.chapters.length === 0 ? (
                          <div className="chapters-list-empty">
                            No chapters in this group.
                          </div>
                        ) : (
                          selectedGroup.chapters
                            .sort((a, b) => a.sequence - b.sequence)
                            .map((chapter) => (
                              <div key={chapter.id} className="chapter-item">
                                <div className="chapter-item-header">
                                  <input
                                    type="number"
                                    value={chapter.sequence}
                                    onChange={(e) =>
                                      handleUpdateChapter(
                                        selectedGroup.id,
                                        chapter.id,
                                        "sequence",
                                        Number(e.target.value),
                                      )
                                    }
                                    className="chapter-sequence-input"
                                    title="Sequence"
                                  />
                                  <input
                                    type="text"
                                    value={chapter.title}
                                    onChange={(e) =>
                                      handleUpdateChapter(
                                        selectedGroup.id,
                                        chapter.id,
                                        "title",
                                        e.target.value,
                                      )
                                    }
                                    className="chapter-title-input"
                                    placeholder="Chapter Title"
                                  />
                                  <label className="chapter-lock-label">
                                    <input
                                      type="checkbox"
                                      checked={chapter.locked}
                                      onChange={(e) =>
                                        handleUpdateChapter(
                                          selectedGroup.id,
                                          chapter.id,
                                          "locked",
                                          e.target.checked,
                                        )
                                      }
                                    />
                                    Lock
                                  </label>
                                  <button
                                    type="button"
                                    className="btn-secondary toggle-images-btn"
                                    onClick={() =>
                                      setExpandedChapterId(
                                        expandedChapterId === chapter.id
                                          ? null
                                          : chapter.id,
                                      )
                                    }
                                  >
                                    {expandedChapterId === chapter.id
                                      ? "Hide Images"
                                      : "Images"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteChapter(
                                        selectedGroup.id,
                                        chapter.id,
                                      )
                                    }
                                    className="delete-chapter-btn"
                                    title="Delete Chapter"
                                  >
                                    ×
                                  </button>
                                </div>
                                {expandedChapterId === chapter.id && (
                                  <div className="chapter-images-area">
                                    <div className="chapter-images-grid">
                                      {chapter.images &&
                                        chapter.images
                                          .sort(
                                            (a, b) => a.sequence - b.sequence,
                                          )
                                          .map((img, index, array) => (
                                            <div
                                              key={img.id}
                                              className="chapter-image-item"
                                            >
                                              <AuthImage
                                                src={`/api/images/${img.id}.webp`}
                                                alt={`Page ${img.sequence}`}
                                                className="chapter-image-img"
                                              />
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleDeleteChapterImage(
                                                    selectedGroup.id,
                                                    chapter.id,
                                                    img.id,
                                                  )
                                                }
                                                className="delete-image-btn"
                                              >
                                                ×
                                              </button>
                                              <div className="image-controls">
                                                <button
                                                  type="button"
                                                  disabled={index === 0}
                                                  onClick={() =>
                                                    handleMoveImage(
                                                      selectedGroup.id,
                                                      chapter.id,
                                                      img.id,
                                                      "left",
                                                    )
                                                  }
                                                  className="move-image-btn"
                                                >
                                                  &lt;
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={
                                                    index === array.length - 1
                                                  }
                                                  onClick={() =>
                                                    handleMoveImage(
                                                      selectedGroup.id,
                                                      chapter.id,
                                                      img.id,
                                                      "right",
                                                    )
                                                  }
                                                  className="move-image-btn"
                                                >
                                                  &gt;
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                      <label className="add-image-box">
                                        +
                                        <input
                                          type="file"
                                          multiple
                                          accept="image/*"
                                          className="hidden-input"
                                          onChange={(e) =>
                                            handleAddChapterImages(
                                              selectedGroup.id,
                                              chapter.id,
                                              e,
                                            )
                                          }
                                        />
                                      </label>
                                    </div>
                                    <div className="image-count">
                                      {chapter.images?.length || 0} pages
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onClose}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditMangaModal;
