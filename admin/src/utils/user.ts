import authService from "./auth";

interface User {
  id: string;
  email: string;
  isAdmin: boolean;
}

async function getUsers(page: number, search?: string): Promise<User[]> {
  const query = new URLSearchParams({
    os: ((page - 1) * 50).toString(),
    lm: "50",
  });

  if (search) query.set("q", search);

  const resp = await authService.get(`/admin/api/users?${query.toString()}`);

  return resp;
}

async function createUser(email: string, password: string): Promise<User> {
  const resp = await authService.post("/admin/api/users", {
    email,
    password,
  });

  return resp;
}

async function deleteUser(userId: string) {
  const resp = await authService.delete(`/admin/api/user/${userId}`);

  return resp;
}

export { getUsers, createUser, deleteUser };
export type { User };
