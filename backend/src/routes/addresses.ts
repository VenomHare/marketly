import { Router } from "express";

const addressesRouter = Router();

addressesRouter.post("/addresses", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

addressesRouter.get("/addresses", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

addressesRouter.get("/addresses/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

addressesRouter.patch("/addresses/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

addressesRouter.delete("/addresses/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default addressesRouter;
