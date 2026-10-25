import { Router } from "express";
import { authenticate, requireVerifiedVendor } from "../middleware/auth";

const productsRouter = Router();

productsRouter.post("/products", authenticate, requireVerifiedVendor, async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.get("/products", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.get("/products/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.patch("/products/:uuid", authenticate, requireVerifiedVendor, async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.delete("/products/:uuid", authenticate, requireVerifiedVendor, async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.get("/vendors/me/products", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.patch("/products/:uuid/status", authenticate, requireVerifiedVendor, async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.patch("/products/:uuid/stock", authenticate, requireVerifiedVendor, async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.post("/products/:uuid/images", authenticate, requireVerifiedVendor, async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.delete("/products/:uuid/images/:imageId", authenticate, requireVerifiedVendor, async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.put("/products/:uuid/images/reorder", authenticate, requireVerifiedVendor, async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.get("/products/:uuid/reviews", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

productsRouter.get("/products/:uuid/related", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default productsRouter;
