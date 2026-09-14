import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  delete process.env.SMARTCAM_API_KEY;
  const mod = await import("./server.ts");
  app = await mod.createApp();
});

afterAll(() => {
  delete process.env.SMARTCAM_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

// ── Auth ativada (SMARTCAM_API_KEY definida) ─────────────────────────────────

describe("Rotas protegidas COM SMARTCAM_API_KEY (auth ativada)", () => {
  let authApp: Express;
  const KEY = "teste-chave-123";

  beforeAll(async () => {
    process.env.SMARTCAM_API_KEY = KEY;
    vi.resetModules();
    const mod = await import("./server.ts");
    authApp = await mod.createApp();
  });

  afterAll(() => {
    delete process.env.SMARTCAM_API_KEY;
    vi.resetModules();
  });

  it("sem header: 401 em rota protegida", async () => {
    const res = await request(authApp).post("/api/scan-network-cameras").send({ subnet: "192.0.2.0/30" });
    expect(res.status).toBe(401);
  });

  it("header errado: 401", async () => {
    const res = await request(authApp)
      .post("/api/scan-network-cameras")
      .set("X-API-Key", "errada")
      .send({ subnet: "192.0.2.0/30" });
    expect(res.status).toBe(401);
  });

  it("header correto: 200", async () => {
    const res = await request(authApp)
      .post("/api/scan-network-cameras")
      .set("X-API-Key", KEY)
      .send({ subnet: "192.0.2.0/30" });
    expect(res.status).toBe(200);
  });

  it("test-camera-ping sem header: 401", async () => {
    const res = await request(authApp).post("/api/test-camera-ping").send({ ip: "192.0.2.1" });
    expect(res.status).toBe(401);
  });

  it("ai-resolve-camera-config sem header: 401", async () => {
    const res = await request(authApp).post("/api/ai-resolve-camera-config").send({ ip: "192.0.2.1" });
    expect(res.status).toBe(401);
  });

  it("analyze-frame com header correto passa por auth (4xx/5xx=input)", async () => {
    const res = await request(authApp)
      .post("/api/analyze-frame")
      .set("X-API-Key", KEY)
      .send({ cameraId: "test", frameData: "data:image/jpeg;base64,/9j/4AAQ" });
    expect([200, 400, 500]).toContain(res.status);
  });

  it("proxy-camera-snapshot sem header: 401", async () => {
    const res = await request(authApp).get("/api/proxy-camera-snapshot");
    expect(res.status).toBe(401);
  });

  it("health é público mesmo com auth", async () => {
    const res = await request(authApp).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.authEnabled).toBe(true);
  });
});

// ── Health ──────────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("retorna 200 com status ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.timestamp).toBeDefined();
  });

  it("reflete authEnabled=false quando SMARTCAM_API_KEY ausente", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body.authEnabled).toBe(false);
  });
});

// ── Sem SMARTCAM_API_KEY definida ────────────────────────────────────────────

describe("Rotas protegidas SEM SMARTCAM_API_KEY (auth desabilitada)", () => {
  it("POST /api/scan-network-cameras aceita sem header (subnet /30 vazio)", async () => {
    const res = await request(app)
      .post("/api/scan-network-cameras")
      .send({ subnet: "192.0.2.0/30" });
    expect(res.status).toBe(200);
    expect(res.body.subnet).toBe("192.0.2.0/30");
    expect(res.body.cameras_discovered).toBe(0);
  });

  it("POST /api/test-camera-ping aceita sem header", async () => {
    const res = await request(app)
      .post("/api/test-camera-ping")
      .send({ ip: "192.0.2.1" });
    expect(res.status).toBe(200);
    expect(res.body.ip).toBe("192.0.2.1");
  });

  it("POST /api/scan-tcp-ports aceita sem header", async () => {
    const res = await request(app)
      .post("/api/scan-tcp-ports")
      .send({ ip: "192.0.2.1", ports: [554] });
    expect(res.status).toBe(200);
    expect(res.body.portsScanned).toHaveLength(1);
  });

  it("POST /api/ai-resolve-camera-config aceita sem header", async () => {
    const res = await request(app)
      .post("/api/ai-resolve-camera-config")
      .send({ ip: "192.0.2.1" });
    expect(res.status).toBe(200);
  });

  it("POST /api/analyze-frame aceita sem header (valida entrada)", async () => {
    const res = await request(app)
      .post("/api/analyze-frame")
      .send({ cameraId: "test", frameData: "data:image/jpeg;base64,/9j/4AAQ" });
    expect([200, 400, 500]).toContain(res.status);
  });
});

// ── Validação de entrada ─────────────────────────────────────────────────────

describe("Validações de parâmetros (400)", () => {
  it("scan-network-cameras: subnet inválida retorna 400", async () => {
    const res = await request(app)
      .post("/api/scan-network-cameras")
      .send({ subnet: "not-a-subnet" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Subnet inválida/);
  });

  it("scan-network-cameras: subnet com CIDR >32 retorna 400", async () => {
    const res = await request(app)
      .post("/api/scan-network-cameras")
      .send({ subnet: "10.0.0.0/33" });
    expect(res.status).toBe(400);
  });

  it("test-camera-ping: IP obrigatório retorna 400", async () => {
    const res = await request(app)
      .post("/api/test-camera-ping")
      .send({});
    expect(res.status).toBe(400);
  });

  it("test-camera-ping: IP inválido retorna 400", async () => {
    const res = await request(app)
      .post("/api/test-camera-ping")
      .send({ ip: "256.1.1.1" });
    expect(res.status).toBe(400);
  });

  it("scan-tcp-ports: IP obrigatório retorna 400", async () => {
    const res = await request(app)
      .post("/api/scan-tcp-ports")
      .send({});
    expect(res.status).toBe(400);
  });

  it("scan-tcp-ports: IP inválido retorna 400", async () => {
    const res = await request(app)
      .post("/api/scan-tcp-ports")
      .send({ ip: "abc" });
    expect(res.status).toBe(400);
  });

  it("ai-resolve-camera-config: IP obrigatório retorna 400", async () => {
    const res = await request(app)
      .post("/api/ai-resolve-camera-config")
      .send({});
    expect(res.status).toBe(400);
  });

  it("ai-resolve-camera-config: IP inválido retorna 400", async () => {
    const res = await request(app)
      .post("/api/ai-resolve-camera-config")
      .send({ ip: "999.999.999.999" });
    expect(res.status).toBe(400);
  });

  it("proxy-camera-snapshot: url obrigatória retorna 400", async () => {
    const res = await request(app).get("/api/proxy-camera-snapshot");
    expect(res.status).toBe(400);
  });

  it("save-scan-log: content obrigatório retorna 400", async () => {
    const res = await request(app)
      .post("/api/save-scan-log")
      .send({ title: "test" });
    expect(res.status).toBe(400);
  });
});

// ── Scan com /30 (resposta rápida) ───────────────────────────────────────────

describe("scan-network-cameras com /30 rápido", () => {
  it("retorna JSON com formato correto", async () => {
    const res = await request(app)
      .post("/api/scan-network-cameras")
      .send({ subnet: "192.0.2.0/30" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      subnet: "192.0.2.0/30",
      scan_timestamp: expect.any(String),
      ports_scanned: [554, 80, 8080, 81],
      total_hosts_probed: 2,
      cameras_discovered: 0,
      devices: [],
    });
  });
});

// ── scan-logs GET (rota pública) ────────────────────────────────────────────

describe("GET /api/scan-logs", () => {
  it("retorna array de logs", async () => {
    const res = await request(app).get("/api/scan-logs");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
  });
});
