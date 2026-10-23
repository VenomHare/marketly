import { Router } from "express";

const uploadsRouter = Router();

uploadsRouter.post("/uploads/presigned-url", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

uploadsRouter.post("/uploads/confirm", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

uploadsRouter.delete("/uploads/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default uploadsRouter;
