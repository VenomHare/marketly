import { Router } from "express";

const ordersRouter = Router();

ordersRouter.post("/checkout/preview", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

ordersRouter.post("/checkout", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

ordersRouter.get("/orders", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

ordersRouter.get("/orders/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

ordersRouter.post("/orders/:uuid/cancel", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

ordersRouter.post("/orders/:uuid/return", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

ordersRouter.get("/orders/:uuid/tracking", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

ordersRouter.get("/admin/orders", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

ordersRouter.patch("/admin/orders/:uuid/status", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default ordersRouter;
