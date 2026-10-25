import { Router } from "express";

const reviewsRouter = Router();

reviewsRouter.post("/products/:uuid/reviews", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

reviewsRouter.get("/products/:uuid/reviews", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

reviewsRouter.get("/reviews/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

reviewsRouter.patch("/reviews/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

reviewsRouter.delete("/reviews/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

reviewsRouter.get("/users/me/reviews", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default reviewsRouter;
