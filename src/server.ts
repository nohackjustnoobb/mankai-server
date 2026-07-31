import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import trackerManager from "#/trackers/manager.server.ts";

trackerManager.start();

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
