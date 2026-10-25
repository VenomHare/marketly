import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import authRouter from "./routes/auth";
import vendorsRouter from "./routes/vendors";
import productsRouter from "./routes/products";
import categoriesRouter from "./routes/categories";
import uploadsRouter from "./routes/uploads";
import cartRouter from "./routes/cart";
import addressesRouter from "./routes/addresses";
import couponsRouter from "./routes/coupons";
import ordersRouter from "./routes/orders";
import vendorOrdersRouter from "./routes/vendorOrders";
import paymentsRouter from "./routes/payments";
import reviewsRouter from "./routes/reviews";
import analyticsRouter from "./routes/analytics";
import searchRouter from "./routes/search";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "";
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not defined in environment variables");
}

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Mount all routers at /api/v1
app.use("/api/v1", authRouter);
app.use("/api/v1", vendorsRouter);
app.use("/api/v1", productsRouter);
app.use("/api/v1", categoriesRouter);
app.use("/api/v1", uploadsRouter);
app.use("/api/v1", cartRouter);
app.use("/api/v1", addressesRouter);
app.use("/api/v1", couponsRouter);
app.use("/api/v1", ordersRouter);
app.use("/api/v1", vendorOrdersRouter);
app.use("/api/v1", paymentsRouter);
app.use("/api/v1", reviewsRouter);
app.use("/api/v1", analyticsRouter);
app.use("/api/v1", searchRouter);

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Something went wrong" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
