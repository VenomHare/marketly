import { Router } from "express";

const searchRouter = Router();

searchRouter.get("/search/products", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

searchRouter.get("/search/suggestions", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

searchRouter.get("/search/trending", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default searchRouter;
