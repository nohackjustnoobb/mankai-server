import { and, eq } from "drizzle-orm";

import { trackingManga, trackingMangaRequest } from "#/db/schema.ts";
import db from "#/lib/db.server.ts";
import { trackerLogger } from "#/lib/logger.server.ts";
import MhgTracker from "#/trackers/mhg.ts";
import MhrTracker from "#/trackers/mhr.ts";
import type Tracker from "#/trackers/tracker.ts";

export type TrackerInfo = {
  id: string;
  name: string;
  description: string;
};

export type TrackingTarget =
  | { ok: true; trackingId: string; mangaId: string }
  | { ok: false; error: string };

export class TrackerManager {
  private readonly trackers = new Map<string, Tracker>();
  private runs: Promise<void>[] | null = null;

  constructor(trackers: Iterable<Tracker>) {
    for (const tracker of trackers) {
      this.trackers.set(tracker.id, tracker);
    }
  }

  getTrackerInfo(): TrackerInfo[] {
    return Array.from(this.trackers.values(), (tracker) => ({
      id: tracker.id,
      name: tracker.name,
      description: tracker.description,
    }));
  }

  resolveTrackingTarget(
    trackingIdInput: string,
    mangaIdInput: string,
    allowUnknownTracker = false,
  ): TrackingTarget {
    const trackingId = trackingIdInput.trim();
    if (!trackingId) {
      return { ok: false, error: "Tracker source is required" };
    }

    const tracker = this.trackers.get(trackingId);
    if (!tracker && !allowUnknownTracker) {
      return { ok: false, error: "Unknown tracker source" };
    }

    // Unknown trackers are accepted only when removing an old durable request.
    const mangaId = tracker
      ? tracker.normalizeMangaId(mangaIdInput)
      : mangaIdInput.trim();
    if (!mangaId) {
      return { ok: false, error: "Manga ID is required" };
    }

    if (tracker && !tracker.validateMangaId(mangaId)) {
      return { ok: false, error: tracker.invalidMangaIdMessage };
    }

    return { ok: true, trackingId, mangaId };
  }

  start(): void {
    if (this.runs) return;

    trackerLogger.info(
      { trackerCount: this.trackers.size },
      "tracker manager starting",
    );
    this.runs = Array.from(this.trackers.values(), (tracker) =>
      tracker.start().catch((error: unknown) => {
        trackerLogger.error(
          {
            trackerId: tracker.id,
            err: error,
          },
          "tracker stopped unexpectedly",
        );
      }),
    );
  }

  async stop(): Promise<void> {
    const runs = this.runs;
    if (!runs) return;

    trackerLogger.info(
      { trackerCount: this.trackers.size },
      "tracker manager stopping",
    );
    for (const tracker of this.trackers.values()) {
      tracker.stop();
    }
    await Promise.all(runs);

    if (this.runs === runs) {
      this.runs = null;
    }
    trackerLogger.info("tracker manager stopped");
  }

  async addTrackingManga(
    userId: string,
    trackingId: string,
    mangaId: string,
  ): Promise<boolean> {
    const pendingAt = new Date();

    return db.transaction(async (tx) => {
      await tx
        .insert(trackingManga)
        .values({
          trackingId,
          id: mangaId,
          status: "pending",
          pendingAt,
        })
        .onConflictDoNothing({
          target: [trackingManga.trackingId, trackingManga.id],
        });

      const [tracked] = await tx
        .select({ status: trackingManga.status })
        .from(trackingManga)
        .where(
          and(
            eq(trackingManga.trackingId, trackingId),
            eq(trackingManga.id, mangaId),
          ),
        )
        .for("update");
      if (!tracked) {
        throw new Error("Failed to create tracking manga");
      }

      const requested = await tx
        .insert(trackingMangaRequest)
        .values({
          trackingId,
          trackingMangaId: mangaId,
          userId,
        })
        .onConflictDoNothing({
          target: [
            trackingMangaRequest.trackingId,
            trackingMangaRequest.trackingMangaId,
            trackingMangaRequest.userId,
          ],
        })
        .returning();

      if (tracked.status === "paused") {
        await tx
          .update(trackingManga)
          .set({
            status: "pending",
            pendingAt,
            failedAt: null,
            failedReason: null,
          })
          .where(
            and(
              eq(trackingManga.trackingId, trackingId),
              eq(trackingManga.id, mangaId),
              eq(trackingManga.status, "paused"),
            ),
          );
      }

      return requested.length > 0;
    });
  }

  async removeTrackingManga(
    userId: string,
    trackingId: string,
    mangaId: string,
  ): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [tracked] = await tx
        .select({ id: trackingManga.id })
        .from(trackingManga)
        .where(
          and(
            eq(trackingManga.trackingId, trackingId),
            eq(trackingManga.id, mangaId),
          ),
        )
        .for("update");
      if (!tracked) return false;

      const removed = await tx
        .delete(trackingMangaRequest)
        .where(
          and(
            eq(trackingMangaRequest.trackingId, trackingId),
            eq(trackingMangaRequest.trackingMangaId, mangaId),
            eq(trackingMangaRequest.userId, userId),
          ),
        )
        .returning();

      const [remainingRequest] = await tx
        .select({ userId: trackingMangaRequest.userId })
        .from(trackingMangaRequest)
        .where(
          and(
            eq(trackingMangaRequest.trackingId, trackingId),
            eq(trackingMangaRequest.trackingMangaId, mangaId),
          ),
        )
        .limit(1);

      if (!remainingRequest) {
        await tx
          .update(trackingManga)
          .set({ status: "paused", pausedAt: new Date() })
          .where(
            and(
              eq(trackingManga.trackingId, trackingId),
              eq(trackingManga.id, mangaId),
            ),
          );
      }

      return removed.length > 0;
    });
  }
}

export const trackerManager = new TrackerManager([
  new MhrTracker(),
  new MhgTracker(),
]);

export default trackerManager;
