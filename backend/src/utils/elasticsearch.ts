import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

type ElasticsearchResponse = {
  acknowledged?: boolean;
  error?: { type?: string; reason?: string };
  result?: string;
  hits?: { total?: number | { value?: number }; hits?: Array<{ _source?: Record<string, unknown>; _id?: string }> };
  [key: string]: unknown;
};

export type SearchableProduct = {
  id: string;
  vendor_id: string;
  category_id: string;
  name: string;
  description: string;
  sku: string;
  price: number;
  stock: number;
  average_rating: number;
  review_count: number;
  status: "draft" | "active" | "archived";
  created_at: Date | string;
  updated_at: Date | string;
};

let productsIndexReady: Promise<void> | undefined;
type PendingIndexOperation = {
  kind: "index" | "delete";
  productId: string;
  product?: SearchableProduct;
  attempts: number;
  timer?: ReturnType<typeof setTimeout>;
};
const pendingIndexOperations = new Map<string, PendingIndexOperation>();

export function elasticsearchRequest(
  method: string,
  path: string,
  body?: unknown,
  acceptedStatuses: number[] = [],
): Promise<ElasticsearchResponse> {
  const base = process.env.ELASTICSEARCH_URL || "https://localhost:9200";
  const url = new URL(`${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported Elasticsearch URL protocol");
  const username = process.env.ELASTICSEARCH_USERNAME;
  const password = process.env.ELASTICSEARCH_PASSWORD;
  const auth = username ? `Basic ${Buffer.from(`${username}:${password || ""}`).toString("base64")}` : undefined;
  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const request = transport(url, {
      method,
      headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
      // Compose uses Elasticsearch's generated self-signed certificate on localhost.
      ...(url.protocol === "https:" && ["localhost", "127.0.0.1"].includes(url.hostname)
        ? { rejectUnauthorized: false }
        : {}),
      timeout: 5000,
    }, (response) => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { data += chunk; });
      response.on("end", () => {
        const statusCode = response.statusCode || 500;
        let parsed: ElasticsearchResponse = {};
        if (data) {
          try { parsed = JSON.parse(data) as ElasticsearchResponse; }
          catch {
            reject(new Error("Elasticsearch returned invalid JSON"));
            return;
          }
        }
        if ((statusCode < 200 || statusCode >= 300) && !acceptedStatuses.includes(statusCode)) {
          const error = new Error(`Elasticsearch returned ${statusCode}: ${parsed.error?.reason || "request failed"}`) as Error & {
            statusCode: number;
            errorType?: string;
          };
          error.statusCode = statusCode;
          error.errorType = parsed.error?.type;
          reject(error);
          return;
        }
        resolve(parsed);
      });
    });
    request.on("timeout", () => request.destroy(new Error("Elasticsearch request timed out")));
    request.on("error", reject);
    request.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function ensureProductsIndex(): Promise<void> {
  if (!productsIndexReady) {
    productsIndexReady = elasticsearchRequest("PUT", "products", {
      mappings: { properties: {
        id: { type: "keyword" },
        vendor_id: { type: "keyword" },
        category_id: { type: "keyword" },
        name: { type: "text", fields: { keyword: { type: "keyword" } } },
        description: { type: "text" },
        sku: { type: "text", fields: { keyword: { type: "keyword" } } },
        price: { type: "double" },
        stock: { type: "integer" },
        average_rating: { type: "float" },
        review_count: { type: "integer" },
        status: { type: "keyword" },
        created_at: { type: "date" },
        updated_at: { type: "date" },
      } },
    }).then(() => undefined).catch((error: Error & { errorType?: string }) => {
      // Elasticsearch returns 400 with this type if another process created the index first.
      if (error.errorType === "resource_already_exists_exception") return;
      productsIndexReady = undefined;
      throw error;
    });
  }
  await productsIndexReady;
}

export async function indexProduct(product: SearchableProduct): Promise<void> {
  await ensureProductsIndex();
  await elasticsearchRequest("PUT", `products/_doc/${encodeURIComponent(product.id)}`, product, [200, 201]);
}

export async function removeProductFromIndex(productId: string): Promise<void> {
  await elasticsearchRequest("DELETE", `products/_doc/${encodeURIComponent(productId)}`, undefined, [404]);
}

function queueIndexOperation(operation: PendingIndexOperation): void {
  const existing = pendingIndexOperations.get(operation.productId);
  if (existing?.timer) clearTimeout(existing.timer);
  pendingIndexOperations.set(operation.productId, operation);
  scheduleIndexRetry(operation);
}

function scheduleIndexRetry(operation: PendingIndexOperation): void {
  const delay = Math.min(1000 * (2 ** Math.min(operation.attempts, 6)), 60_000);
  operation.timer = setTimeout(async () => {
    if (pendingIndexOperations.get(operation.productId) !== operation) return;
    try {
      if (operation.kind === "delete") await removeProductFromIndex(operation.productId);
      else if (operation.product) await indexProduct(operation.product);
      pendingIndexOperations.delete(operation.productId);
    } catch (error) {
      operation.attempts += 1;
      console.error("Retry product search index sync error:", error);
      scheduleIndexRetry(operation);
    }
  }, delay);
  operation.timer.unref();
}

export async function syncProductIndex(product: SearchableProduct): Promise<void> {
  try {
    await indexProduct(product);
    const pending = pendingIndexOperations.get(product.id);
    if (pending?.timer) clearTimeout(pending.timer);
    pendingIndexOperations.delete(product.id);
  } catch (error) {
    console.error("Product search index sync failed; queued for retry:", error);
    queueIndexOperation({ kind: "index", productId: product.id, product, attempts: 0 });
  }
}

export async function syncProductDeletion(productId: string): Promise<void> {
  try {
    await removeProductFromIndex(productId);
    const pending = pendingIndexOperations.get(productId);
    if (pending?.timer) clearTimeout(pending.timer);
    pendingIndexOperations.delete(productId);
  } catch (error) {
    console.error("Product search index delete failed; queued for retry:", error);
    queueIndexOperation({ kind: "delete", productId, attempts: 0 });
  }
}
