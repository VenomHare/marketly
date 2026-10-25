import { Router } from "express";

const categoriesRouter = Router();

categoriesRouter.get("/categories", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

categoriesRouter.get("/categories/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

categoriesRouter.get("/categories/:uuid/products", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default categoriesRouter;
