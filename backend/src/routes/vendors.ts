import { Router } from "express";

const vendorsRouter = Router();

vendorsRouter.post("/vendors", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/vendors/me", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.patch("/vendors/me", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/vendors/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/vendors/:uuid/products", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/vendors/me/dashboard", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/vendors/me/orders", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/vendors/me/settlements", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/admin/vendors", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/admin/vendors/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.patch("/admin/vendors/:uuid/verify", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.patch("/admin/vendors/:uuid/status", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default vendorsRouter;
