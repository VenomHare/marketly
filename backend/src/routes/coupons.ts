import { Router } from "express";

const couponsRouter = Router();

couponsRouter.post("/admin/coupons", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

couponsRouter.get("/coupons", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

couponsRouter.get("/coupons/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

couponsRouter.patch("/admin/coupons/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

couponsRouter.delete("/admin/coupons/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

couponsRouter.post("/coupons/validate", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

couponsRouter.get("/users/me/coupons", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default couponsRouter;
