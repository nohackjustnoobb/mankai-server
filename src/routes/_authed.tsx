import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getCurrentUserFn } from "#/utils/auth.functions";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location }) => {
    const user = await getCurrentUserFn();

    if (!user) {
      throw redirect({
        to: "/",
        search: { redirect: location.href },
      });
    }

    return { user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return <Outlet />;
}
