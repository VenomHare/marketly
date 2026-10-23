import { Router } from "express";

const authRouter = Router();

authRouter.post("/auth/register", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

authRouter.post("/auth/login", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

authRouter.post("/auth/refresh", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

authRouter.post("/auth/logout", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

authRouter.get("/users/me", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

authRouter.patch("/users/me", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

authRouter.patch("/users/me/password", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

authRouter.get("/users/me/orders", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

authRouter.get("/admin/users", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

authRouter.get("/admin/users/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

authRouter.patch("/admin/users/:uuid/status", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default authRouter;