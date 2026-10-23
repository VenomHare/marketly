import { Router } from "express";

const vendorOrdersRouter = Router();

vendorOrdersRouter.get("/vendor-orders", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorOrdersRouter.get("/vendor-orders/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorOrdersRouter.patch("/vendor-orders/:uuid/status", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorOrdersRouter.post("/vendor-orders/:uuid/shipment", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorOrdersRouter.patch("/vendor-orders/:uuid/shipment", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorOrdersRouter.get("/vendor-orders/:uuid/history", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default vendorOrdersRouter;
