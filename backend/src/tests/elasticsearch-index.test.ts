import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { indexProduct, removeProductFromIndex, syncProductDeletion, syncProductIndex, type SearchableProduct } from "../utils/elasticsearch";

describe("Elasticsearch product indexing", () => {
  let server: Server;
  let baseUrl: string;
  let statusCode = 200;
  let responseBody: unknown = { acknowledged: true };
  const requests: Array<{ method?: string; url?: string; body?: Record<string, unknown> }> = [];
  const product: SearchableProduct = {
    id: "product-123",
    vendor_id: "vendor-123",
    category_id: "category-123",
    name: "Mechanical Keyboard",
    description: "A compact keyboard",
    sku: "KEYBOARD-123",
    price: 89.99,
    stock: 12,
    average_rating: 4.5,
    review_count: 8,
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let data = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => { data += chunk; });
      req.on("end", () => {
        requests.push({
          method: req.method,
          url: req.url,
          ...(data ? { body: JSON.parse(data) as Record<string, unknown> } : {}),
        });
        res.statusCode = statusCode;
        res.setHeader("content-type", "application/json");
        res.end(responseBody === undefined ? "" : JSON.stringify(responseBody));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    process.env.ELASTICSEARCH_URL = baseUrl;
    process.env.ELASTICSEARCH_USERNAME = "index-user";
    process.env.ELASTICSEARCH_PASSWORD = "index-password";
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete process.env.ELASTICSEARCH_URL;
    delete process.env.ELASTICSEARCH_USERNAME;
    delete process.env.ELASTICSEARCH_PASSWORD;
  });

  beforeEach(() => {
    statusCode = 200;
    responseBody = { acknowledged: true };
    requests.length = 0;
  });

  it("creates a mapped products index and upserts the product document", async () => {
    await indexProduct(product);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ method: "PUT", url: "/products" });
    expect(requests[0]?.body).toMatchObject({
      mappings: { properties: {
        category_id: { type: "keyword" },
        status: { type: "keyword" },
        name: { type: "text", fields: { keyword: { type: "keyword" } } },
        price: { type: "double" },
        created_at: { type: "date" },
      } },
    });
    expect(requests[1]).toEqual({
      method: "PUT",
      url: "/products/_doc/product-123",
      body: product,
    });
  });

  it("deletes product documents and treats an already-missing document as success", async () => {
    statusCode = 404;
    responseBody = undefined;
    await expect(removeProductFromIndex("product-123")).resolves.toBeUndefined();
    expect(requests[0]).toMatchObject({ method: "DELETE", url: "/products/_doc/product-123" });
  });

  it("upserts changed status and product fields into the same document", async () => {
    await indexProduct({ ...product, status: "draft", price: 99.5, updated_at: "2026-02-01T00:00:00.000Z" });
    expect(requests[0]).toEqual({
      method: "PUT",
      url: "/products/_doc/product-123",
      body: { ...product, status: "draft", price: 99.5, updated_at: "2026-02-01T00:00:00.000Z" },
    });
  });

  it("propagates Elasticsearch failures so the caller can report failed synchronization", async () => {
    statusCode = 503;
    responseBody = { error: { type: "unavailable", reason: "cluster unavailable" } };
    await expect(indexProduct(product)).rejects.toThrow("Elasticsearch returned 503: cluster unavailable");
  });

  it("does not fail MongoDB-backed routes when Elasticsearch is unavailable", async () => {
    statusCode = 503;
    responseBody = { error: { type: "unavailable", reason: "cluster unavailable" } };
    await expect(syncProductIndex(product)).resolves.toBeUndefined();
    await expect(syncProductDeletion(product.id)).resolves.toBeUndefined();
  });
});
