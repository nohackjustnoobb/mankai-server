import HyperExpress from "hyper-express";
import prisma from "../../utils/prisma";
import {
  generateTokens,
  hashPassword,
  TokenPayload,
  validatePassword,
} from "../auth";

function setupAdminUserRoutes(server: HyperExpress.Server) {
  // Get all users
  server.get("/admin/api/users", async (request, response) => {
    try {
      const offsetParam = request.query?.os;
      const limitParam = request.query?.lm;
      const searchParam = request.query?.q;
      let offset: number | undefined = undefined;
      let limit: number = 50;
      let search: string | undefined = undefined;

      if (offsetParam) {
        const parsed = Number(offsetParam);
        if (!isNaN(parsed) && parsed >= 0) offset = parsed;
      }

      if (limitParam) {
        const parsed = Number(limitParam);
        if (!isNaN(parsed) && parsed > 0) limit = parsed;
      }

      if (searchParam && typeof searchParam === "string")
        search = searchParam.trim();

      const users = await prisma.user.findMany({
        skip: offset,
        take: Math.min(limit, 50),
        orderBy: { id: "desc" },
        where: search
          ? {
              email: { contains: search },
            }
          : undefined,
        select: {
          id: true,
          email: true,
          isAdmin: true,
        },
      });

      response.status(200).json(users);
    } catch (error) {
      console.error(error);
      response.status(400).json({ error: "Failed to retrieve users" });
    }
  });

  // User Registration
  server.post("/admin/api/users", async (request, response) => {
    try {
      const { email, password } = await request.json();

      // Validation
      if (!email || !password) {
        return response
          .status(400)
          .json({ error: "Email and password are required" });
      }

      // Email validation
      const normalizedEmail = email.toLowerCase().trim();
      if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
        return response.status(400).json({ error: "Invalid email format" });
      }

      // Password validation
      if (!validatePassword(password)) {
        return response.status(400).json({
          error:
            "Password must be 8-100 chars, include at least one letter and one digit.",
        });
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingUser) {
        return response
          .status(409)
          .json({ error: "User already exists with this email" });
      }

      // Create new user
      const hashedPassword = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
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

      response.status(201).json({
        message: "User registered successfully",
        user: {
          id: user.id,
          email: user.email,
          isAdmin: user.isAdmin,
        },
        ...tokens,
      });
    } catch (error) {
      console.error(error);
      response.status(400).json({ error: "User registration failed" });
    }
  });

  // User Deletion
  server.delete("/admin/api/user/:id", async (request, response) => {
    try {
      const userId = Number(request.params.id);
      if (isNaN(userId) || userId <= 0 || userId === request.payload?.userId) {
        return response.status(400).json({ error: "Invalid user ID" });
      }

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return response.status(404).json({ error: "User not found" });
      }

      // Delete user
      await prisma.user.delete({
        where: { id: userId },
      });

      response.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
      console.error(error);
      response.status(400).json({ error: "Failed to delete user" });
    }
  });
}

export { setupAdminUserRoutes };
