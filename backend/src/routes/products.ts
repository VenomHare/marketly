import { Router } from "express";

const productsRouter = Router();

productsRouter.post("/products", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.get("/products", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.get("/products/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.patch("/products/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.delete("/products/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.get("/vendors/me/products", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.patch("/products/:uuid/status", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.patch("/products/:uuid/stock", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.post("/products/:uuid/images", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.delete("/products/:uuid/images/:imageId", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.put("/products/:uuid/images/reorder", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.get("/products/:uuid/reviews", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.get("/products/:uuid/related", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default productsRouter;
