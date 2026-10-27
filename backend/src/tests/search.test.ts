import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import searchRouter from "../routes/search";

describe("Search routes", () => {
  let elastic: Server;
  let api: Server;
  let baseUrl: string;
  let elasticUrl: string;
  let lastRequest: { url?: string; body?: Record<string, any>; authorization?: string } = {};
  let status = 200;
  let responseBody: unknown;

  beforeAll(async () => {
    elastic = createServer((req, res) => {
      let data = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => { data += chunk; });
      req.on("end", () => {
        lastRequest = { url: req.url, body: JSON.parse(data), authorization: req.headers.authorization };
        res.statusCode = status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(responseBody));
      });
    });
    await new Promise<void>((resolve) => elastic.listen(0, "127.0.0.1", resolve));
    elasticUrl = `http://127.0.0.1:${(elastic.address() as { port: number }).port}`;
    process.env.ELASTICSEARCH_URL = elasticUrl;
    process.env.ELASTICSEARCH_USERNAME = "test-user";
    process.env.ELASTICSEARCH_PASSWORD = "test-password";

    const app = express();
    app.use(searchRouter);
    api = createServer(app);
    await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(api.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    await Promise.all([api, elastic].map((server) => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    )));
    delete process.env.ELASTICSEARCH_URL;
    delete process.env.ELASTICSEARCH_USERNAME;
    delete process.env.ELASTICSEARCH_PASSWORD;
  });

  beforeEach(() => {
    status = 200;
    responseBody = { hits: { total: { value: 1 }, hits: [{ _id: "product-1", _source: { name: "Keyboard", price: 20 } }] } };
    lastRequest = {};
  });

  describe("GET /search/products", () => {
  it("searches active products with the documented filters, sorting, pagination, and auth", async () => {
    const response = await fetch(`${baseUrl}/search/products?q=mechanical%20keyboard&category=electronics&minPrice=10&maxPrice=50&sortBy=price&order=asc&page=2&limit=5`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      products: [{ id: "product-1", name: "Keyboard", price: 20 }], total: 1, page: 2, limit: 5, totalPages: 1,
    });
    expect(lastRequest.url).toBe("/products/_search");
    expect(lastRequest.authorization).toBe(`Basic ${Buffer.from("test-user:test-password").toString("base64")}`);
    expect(lastRequest.body).toMatchObject({
      from: 5,
      size: 5,
      query: { bool: { filter: [
        { term: { status: "active" } },
        { term: { category_id: "electronics" } },
        { range: { price: { gte: 10, lte: 50 } } },
      ], must: [{ multi_match: { query: "mechanical keyboard" } }] } },
      sort: [{ price: { order: "asc" } }],
    });
  });

  it("supports an empty query as a browse request and descending sort", async () => {
    const response = await fetch(`${baseUrl}/search/products?sortBy=price&order=desc`);
    expect(response.status).toBe(200);
    expect(lastRequest.body?.query).toEqual({ bool: { filter: [{ term: { status: "active" } }] } });
    expect(lastRequest.body?.sort).toEqual([{ price: { order: "desc" } }]);
  });

  it.each([
    "?q=%20%20", "?q=${" + "x".repeat(201) + "}", "?minPrice=-1", "?maxPrice=NaN",
    "?page=0", "?page=1.5", "?page=100001", "?limit=0", "?limit=101", "?sortBy=stock", "?order=sideways",
    "?unknown=value", "?category=%20%20",
  ])("rejects invalid input %s", async (query) => {
    const response = await fetch(`${baseUrl}/search/products${query}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid search parameters" });
  });

  it("rejects a minimum price above the maximum price", async () => {
    const response = await fetch(`${baseUrl}/search/products?minPrice=10&maxPrice=2`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "minPrice must not exceed maxPrice" });
  });

  it("returns an empty result page and handles large result totals", async () => {
    responseBody = { hits: { total: { value: 0 }, hits: [] } };
    const response = await fetch(`${baseUrl}/search/products`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ products: [], total: 0, totalPages: 0 });
  });

  it("fails safely when Elasticsearch rejects a request", async () => {
    status = 503;
    responseBody = { error: "unavailable" };
    const response = await fetch(`${baseUrl}/search/products`);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ message: "Product search is temporarily unavailable" });
  });

  it("fails safely for malformed Elasticsearch results", async () => {
    responseBody = { hits: { total: "invalid", hits: [] } };
    const response = await fetch(`${baseUrl}/search/products`);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ message: "Product search is temporarily unavailable" });
  });
  });

  describe("GET /search/suggestions", () => {
  it("returns distinct active product name suggestions matching the prefix", async () => {
    responseBody = { hits: { hits: [
      { _source: { name: "Mechanical Keyboard" } },
      { _source: { name: "Mechanical Keyboard" } },
      { _source: { name: "Mechanical Keyboard Case" } },
      { _source: { name: "   " } },
      { _source: { description: "No product name" } },
    ] } };
    const response = await fetch(`${baseUrl}/search/suggestions?q=mechanical&limit=5`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: ["Mechanical Keyboard", "Mechanical Keyboard Case"] });
    expect(lastRequest.url).toBe("/products/_search");
    expect(lastRequest.body).toMatchObject({
      size: 15,
      _source: ["name"],
      query: { bool: { filter: [{ term: { status: "active" } }], must: [{ match_phrase_prefix: { name: { query: "mechanical" } } }] } },
    });
  });

  it.each(["", "?q=%20%20", `?q=${"x".repeat(101)}`, "?q=a&limit=0", "?q=a&limit=21", "?q=a&extra=x"])(
    "rejects invalid suggestion input %s", async (query) => {
      const response = await fetch(`${baseUrl}/search/suggestions${query}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ message: "Invalid suggestion parameters" });
    },
  );

  it("fails safely when Elasticsearch is unavailable for suggestions", async () => {
    status = 503;
    responseBody = { error: "unavailable" };
    const response = await fetch(`${baseUrl}/search/suggestions?q=key`);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ message: "Search suggestions are temporarily unavailable" });
  });
  });

  describe("GET /search/trending", () => {
    it("returns active products ordered by review count and rating", async () => {
      const response = await fetch(`${baseUrl}/search/trending?limit=5`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        products: [{ id: "product-1", name: "Keyboard", price: 20 }],
      });
      expect(lastRequest.url).toBe("/products/_search");
      expect(lastRequest.body).toEqual({
        size: 5,
        query: { term: { status: "active" } },
        sort: [
          { review_count: { order: "desc" } },
          { average_rating: { order: "desc" } },
          { created_at: { order: "desc" } },
        ],
      });
    });

    it.each(["?limit=0", "?limit=51", "?limit=1.5", "?extra=value"])(
      "rejects invalid trending input %s", async (query) => {
        const response = await fetch(`${baseUrl}/search/trending${query}`);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ message: "Invalid trending parameters" });
      },
    );

    it("returns an empty product list when no active products match", async () => {
      responseBody = { hits: { hits: [] } };
      const response = await fetch(`${baseUrl}/search/trending`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ products: [] });
    });

    it("fails safely when Elasticsearch is unavailable", async () => {
      status = 503;
      responseBody = { error: "unavailable" };
      const response = await fetch(`${baseUrl}/search/trending`);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ message: "Trending products are temporarily unavailable" });
    });

    it("fails safely for malformed Elasticsearch results", async () => {
      responseBody = { hits: { hits: "invalid" } };
      const response = await fetch(`${baseUrl}/search/trending`);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ message: "Trending products are temporarily unavailable" });
    });
  });
});
