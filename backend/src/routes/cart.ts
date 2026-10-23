import { Router } from "express";

const cartRouter = Router();

cartRouter.get("/cart", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

cartRouter.post("/cart/items", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

cartRouter.patch("/cart/items/:itemId", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

cartRouter.delete("/cart/items/:itemId", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

cartRouter.delete("/cart", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

cartRouter.post("/cart/merge", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

cartRouter.post("/cart/validate", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default cartRouter;
