import HyperExpress from "hyper-express";
import prisma from "../utils/prisma";
import { generateTokens, hashPassword, TokenPayload } from "./auth";

function setupUserEndpoints(server: HyperExpress.Server) {
  server.get("/api/user", async (request, response) => {
    const payload = request.payload;
    if (!payload) {
      return response.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        isAdmin: true,
      },
    });

    response.status(200).json({ ...user });
  });

  server.patch("/api/user", async (request, response) => {
    const payload = request.payload;
    if (!payload) {
      return response.status(401).json({ error: "Unauthorized" });
    }

    const { password } = await request.json();

    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.update({
      where: { id: payload.userId },
      data: {
        password: hashedPassword,
      },
    });

    // Generate tokens
    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      passwordHash: user.password,
      isAdmin: user.isAdmin,
    };

    const tokens = generateTokens(tokenPayload);

    response.status(200).json({
      message: "User updated successfully",
      user: {
        id: user.id,
        email: user.email,
        isAdmin: user.isAdmin,
      },
      ...tokens,
    });
  });
}

export { setupUserEndpoints };
