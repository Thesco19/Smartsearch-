import express from "express";
import path from "path";
import net from "net";
import http from "http";
import { pathToFileURL } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { networkInterfaces } from "os";
import { parseSubnet, getIpRange, isValidIpv4 } from "./src/utils/network.ts";
import { normalizeDetections } from "./src/utils/detection.ts";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const API_KEY = process.env.SMARTCAM_API_KEY;

// Real TCP Socket probe for backend reachability test
function probeTcpSocket(
  host: string,
  port: number,
  timeoutMs = 900
): Promise<{ reachable: boolean; latencyMs: number; hostAlive: boolean; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      if (!settled) {
        settled = true;
        const latencyMs = Date.now() - start;
        socket.destroy();
        resolve({ reachable: true, latencyMs, hostAlive: true });
      }
    });

    socket.on("timeout", () => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve({ reachable: false, latencyMs: timeoutMs, hostAlive: false, error: "timeout" });
      }
    });

    socket.on("error", (err: any) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        // ECONNREFUSED means the host is alive and responded with a TCP reset (RST packet)
        const hostAlive = err.code === "ECONNREFUSED";
        resolve({
          reachable: false,
          latencyMs: Date.now() - start,
          hostAlive,
          error: err.code || err.message,
        });
      }
    });

    try {
      socket.connect(port, host);
    } catch (e: any) {
      if (!settled) {
        settled = true;
        resolve({ reachable: false, latencyMs: Date.now() - start, hostAlive: false, error: e.message });
      }
    }
  });
}

export async function createApp() {
  const app = express();

  // Middleware for large payload base64 frames
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Optional API-key auth: if SMARTCAM_API_KEY is set, /api/scan-* and
  // /api/analyze-frame require the X-API-Key header. Without it, endpoints stay open.
  const requireApiKey: express.RequestHandler = (req, res, next) => {
    if (!API_KEY) return next();
    const provided = req.headers["x-api-key"];
    if (provided === API_KEY) return next();
    return res.status(401).json({ error: "API key ausente ou inválida." });
  };

  // Initialize Gemini client lazily/safely
  const getAiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  };

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      hasKey: Boolean(process.env.GEMINI_API_KEY),
      authEnabled: Boolean(API_KEY),
    });
  });

  // Real network camera scanner
  function getLocalSubnet(): string {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]!) {
        if (net.family === "IPv4" && !net.internal) {
          const ip = net.address;
          // net.cidr like "10.0.1.95/24" -> extract prefix bits only
          const cidr = parseInt((net.cidr || "").split("/")[1] || "24", 10);
          const parts = ip.split(".");
          parts[3] = "0";
          return `${parts.join(".")}/${cidr}`;
        }
      }
    }
    return "192.168.1.0/24";
  }

  async function tcpConnect(ip: string, port: number, timeout = 800): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeout);
      socket.on("connect", () => { socket.destroy(); resolve(true); });
      socket.on("timeout", () => { socket.destroy(); resolve(false); });
      socket.on("error", () => { socket.destroy(); resolve(false); });
      socket.connect(port, ip);
    });
  }

  async function checkRtsp(ip: string, port: number): Promise<{ success: boolean; banner?: string }> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1500);
      let data = "";
      socket.on("connect", () => {
        socket.write("OPTIONS rtsp://" + ip + ":" + port + "/ RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: SmartCamScanner\r\n\r\n");
      });
      socket.on("data", (chunk: Buffer) => {
        data += chunk.toString();
        if (data.includes("RTSP/1.0 200") || data.includes("Public:")) {
          socket.destroy();
          resolve({ success: true, banner: data.trim() });
        }
      });
      socket.on("timeout", () => { socket.destroy(); resolve({ success: false }); });
      socket.on("error", () => { socket.destroy(); resolve({ success: false }); });
      socket.connect(port, ip);
    });
  }

  async function checkOnvif(ip: string, port: number): Promise<{ success: boolean; info?: any }> {
    return new Promise((resolve) => {
      const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body>
    <GetSystemDateAndTime xmlns="http://www.onvif.org/ver10/device/wsdl"/>
  </s:Body>
</s:Envelope>`;
      const options = {
        hostname: ip,
        port: port,
        path: "/onvif/device_service",
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8",
          "Content-Length": Buffer.byteLength(soapBody),
          "SOAPAction": "http://www.onvif.org/ver10/device/wsdl/GetSystemDateAndTime",
        },
        timeout: 2000,
      };
      const req = http.request(options, (res: any) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          if (res.statusCode === 200 && data.includes("GetSystemDateAndTimeResponse")) {
            resolve({ success: true, info: data });
          } else {
            resolve({ success: false });
          }
        });
      });
      req.on("error", () => resolve({ success: false }));
      req.on("timeout", () => { req.destroy(); resolve({ success: false }); });
      req.write(soapBody);
      req.end();
    });
  }

  async function checkHttpMjpeg(ip: string, port: number): Promise<{ success: boolean; url?: string }> {
    return new Promise((resolve) => {
      const paths = ["/", "/video", "/mjpeg", "/stream", "/mjpg/video.mjpg", "/axis-cgi/mjpg/video.cgi", "/cgi-bin/mjpg/video.cgi", "/live", "/video.cgi"];
      let checked = 0;
      const tryPath = (path: string) => {
        const options = { hostname: ip, port, path, method: "GET", timeout: 1500 };
        const req = http.request(options, (res: any) => {
          if (res.statusCode === 200) {
            const ct = res.headers["content-type"] || "";
            if (ct.includes("multipart/x-mixed-replace") || ct.includes("image/") || ct.includes("video/")) {
              req.destroy();
              resolve({ success: true, url: `http://${ip}:${port}${path}` });
              return;
            }
          }
          checked++;
          if (checked < paths.length) tryPath(paths[checked]);
          else resolve({ success: false });
        });
        req.on("error", () => { checked++; if (checked < paths.length) tryPath(paths[checked]); else resolve({ success: false }); });
        req.on("timeout", () => { req.destroy(); checked++; if (checked < paths.length) tryPath(paths[checked]); else resolve({ success: false }); });
        req.end();
      };
      tryPath(paths[0]);
    });
  }

  // Conservative per-host TCP connect probe: low concurrency is network-friendly.
  async function tcpConnectGentle(ip: string, port: number, timeout = 700): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeout);
      socket.on("connect", () => { socket.destroy(); resolve(true); });
      socket.on("timeout", () => { socket.destroy(); resolve(false); });
      socket.on("error", () => { socket.destroy(); resolve(false); });
      socket.connect(port, ip);
    });
  }

  async function identifyCamera(ip: string, openPorts: number[]): Promise<any | null> {
    // Try RTSP first (port 554)
    if (openPorts.includes(554)) {
      const rtsp = await checkRtsp(ip, 554);
      if (rtsp.success) {
        const onvif = await checkOnvif(ip, 554);
        return {
          ip,
          port: 554,
          protocol: onvif.success ? "ONVIF" : "RTSP",
          streamUrl: `rtsp://${ip}:554/`,
          brand: onvif.success ? "ONVIF Camera" : "RTSP Camera",
          model: "Unknown",
        };
      }
    }
    // Try ONVIF on 8080
    if (openPorts.includes(8080)) {
      const onvif = await checkOnvif(ip, 8080);
      if (onvif.success) {
        return { ip, port: 8080, protocol: "ONVIF", streamUrl: `rtsp://${ip}:8080/`, brand: "ONVIF Camera", model: "Unknown" };
      }
    }
    // Try HTTP/MJPEG on common ports
    for (const port of [80, 8000, 81, 8080]) {
      if (openPorts.includes(port)) {
        const http = await checkHttpMjpeg(ip, port);
        if (http.success) {
          return { ip, port, protocol: "HTTP", streamUrl: http.url, brand: "HTTP Camera", model: "MJPEG/HTTP Stream" };
        }
      }
    }
    return null;
  }

  // Network cameras discovery endpoint - REAL SCAN (gentle, router-safe)
  app.post("/api/scan-network-cameras", requireApiKey, async (req, res) => {
    const { subnet } = req.body;
    const targetSubnet = subnet || getLocalSubnet();
    if (!parseSubnet(targetSubnet)) {
      return res.status(400).json({ error: "Subnet inválida. Use o formato IPv4/CIDR (ex: 192.168.1.0/24)." });
    }
    console.log(`[Scanner] Iniciando varredura conservadora em ${targetSubnet}`);

    const ips = getIpRange(targetSubnet);
    const portsToScan = [554, 80, 8080, 81];
    const devices: any[] = [];
    let scannedCount = 0;

    // Gentle scan: small batches, per-host port probes in series, pause between batches.
    // This avoids overwhelming cheap routers/switches with concurrent TCP handshakes.
    const batchSize = 5;
    const batchPauseMs = 350;
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const promises = batch.map(async (ip) => {
        const openPorts: number[] = [];
        for (const port of portsToScan) {
          if (await tcpConnectGentle(ip, port, 600)) {
            openPorts.push(port);
          }
        }
        if (openPorts.length > 0) {
          const cam = await identifyCamera(ip, openPorts);
          if (cam) {
            const id = `cam-${ip.replace(/\./g, "-")}-${cam.port}`;
            devices.push({
              id,
              name: `CAM-${devices.length + 1} [${ip}:${cam.port}]`,
              brand: cam.brand,
              model: cam.model,
              ip: cam.ip,
              port: cam.port,
              protocol: cam.protocol,
              streamUrl: cam.streamUrl,
              resolution: "Unknown",
              fps: 30,
              status: "online",
              latencyMs: 0,
              macAddress: "Unknown",
              location: "Rede Local",
              sceneType: "unknown" as string,
              lighting: "day" as string,
              requiresAuth: false,
              isRealStream: true,
            });
          }
        }
        scannedCount++;
      });
      await Promise.all(promises);
      console.log(`[Scanner] Progresso: ${scannedCount}/${ips.length} hosts`);
      if (i + batchSize < ips.length) {
        await new Promise((r) => setTimeout(r, batchPauseMs));
      }
    }

    res.json({
      subnet: targetSubnet,
      scan_timestamp: new Date().toISOString(),
      ports_scanned: portsToScan,
      total_hosts_probed: ips.length,
      cameras_discovered: devices.length,
      devices,
      note: "Varredura conservadora com baixa concorrência para não sobrecarregar a rede.",
    });
  });

  // Test Camera Connection Endpoint - REAL TEST (protocol aware)
  app.post("/api/test-camera-ping", requireApiKey, async (req, res) => {
    const { ip, port = 554, protocol = "RTSP" } = req.body;
    if (!ip) {
      return res.status(400).json({ error: "Endereço IP é obrigatório." });
    }
    if (!isValidIpv4(String(ip))) {
      return res.status(400).json({ error: "Endereço IP inválido." });
    }

    const numPort = Number(port) || 554;
    const start = Date.now();
    let reachable = false;
    let banner = "";
    let hostAlive = false;
    let error: string | undefined;

    try {
      if (protocol === "RTSP" || protocol === "ONVIF") {
        const rtsp = await checkRtsp(ip, numPort);
        reachable = rtsp.success;
        hostAlive = true;
        banner = rtsp.success
          ? `RTSP/ONVIF respondendo em ${ip}:${numPort}`
          : `Porta ${numPort} aberta mas sem resposta RTSP/ONVIF`;
      } else if (protocol === "HTTP" || protocol === "MJPEG") {
        const http = await checkHttpMjpeg(ip, numPort);
        reachable = http.success;
        hostAlive = true;
        banner = http.url
          ? `HTTP stream encontrado: ${http.url}`
          : `Porta ${numPort} HTTP aberta sem stream MJPEG`;
      } else {
        const probe = await probeTcpSocket(ip, numPort, 1000);
        reachable = probe.reachable;
        hostAlive = probe.hostAlive;
        error = probe.error;
        banner = probe.reachable
          ? `Porta TCP ${numPort} ABERTA em ${ip}`
          : probe.hostAlive
          ? `Host ${ip} respondeu, porta ${numPort} FECHADA (TCP RST)`
          : `Host ${ip}:${numPort} não respondeu (timeout)`;
      }
    } catch (e: any) {
      reachable = false;
      hostAlive = false;
      banner = "Erro durante teste";
      error = e.message;
    }
    const latencyMs = Date.now() - start;

    res.json({
      ip,
      port: numPort,
      protocol,
      reachable,
      hostAlive,
      latencyMs,
      banner,
      error,
      timestamp: new Date().toISOString(),
    });
  });

  // Real Multi-Port Scan Endpoint (TCP Sockets)
  app.post("/api/scan-tcp-ports", requireApiKey, async (req, res) => {
    const { ip, ports = [554, 5000, 8899, 80, 8080, 81] } = req.body;
    if (!ip) {
      return res.status(400).json({ error: "Endereço IP é obrigatório." });
    }
    if (!isValidIpv4(String(ip))) {
      return res.status(400).json({ error: "Endereço IP inválido." });
    }

    const results = [];
    for (const p of ports) {
      const numPort = Number(p);
      const probe = await probeTcpSocket(ip, numPort, 600);
      results.push({
        port: numPort,
        reachable: probe.reachable,
        hostAlive: probe.hostAlive,
        latencyMs: probe.latencyMs,
        error: probe.error,
      });
    }

    res.json({
      ip,
      scannedAt: new Date().toISOString(),
      portsScanned: results,
    });
  });

  // Diagnostic Log Storage Endpoint (in-memory store for sharing & troubleshooting)
  let latestDiagnosticLogs: Array<{ id: string; savedAt: string; title: string; content: string }> = [];

  app.post("/api/save-scan-log", requireApiKey, (req, res) => {
    const { title = "Relatório de Rastreio de Rede", content } = req.body;
    if (!content) {
      return res.status(400).json({ error: "Conteúdo do log é obrigatório." });
    }

    const entry = {
      id: `log-${Date.now()}`,
      savedAt: new Date().toISOString(),
      title,
      content,
    };

    latestDiagnosticLogs.unshift(entry);
    if (latestDiagnosticLogs.length > 20) {
      latestDiagnosticLogs = latestDiagnosticLogs.slice(0, 20);
    }

    res.json({ success: true, logId: entry.id, savedAt: entry.savedAt });
  });

  app.get("/api/scan-logs", (req, res) => {
    res.json({ logs: latestDiagnosticLogs });
  });

  // Proxy camera snapshot endpoint (solves CORS / Mixed-Content for reachable camera URLs)
  app.get("/api/proxy-camera-snapshot", requireApiKey, async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).json({ error: "Parâmetro 'url' é obrigatório." });
    }
    try {
      const parsedUrl = new URL(targetUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return res.status(400).json({ error: "URL inválida. Somente http/https são aceitos." });
      }
    } catch {
      return res.status(400).json({ error: "URL inválida." });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "SmartCam-Proxy/1.0",
          Accept: "image/jpeg,image/png,image/*,*/*",
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Falha ao obter imagem da câmera: ${response.status} ${response.statusText}`,
        });
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      const buffer = await response.arrayBuffer();

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      res.status(502).json({
        error: `Não foi possível conectar ao endereço da câmera (${err.message}). Verifique se o endereço é acessível.`,
      });
    }
  });

  // AI Camera Config Resolver (Gemini deduces brand, model, stream paths, and protocol)
  app.post("/api/ai-resolve-camera-config", requireApiKey, async (req, res) => {
    try {
      const { ip, detectedPorts = [], bannerInfo = "", partialBrandOrModel = "" } = req.body;

      if (!ip) {
        return res.status(400).json({ error: "O endereço IP é obrigatório." });
      }
      if (!isValidIpv4(String(ip))) {
        return res.status(400).json({ error: "Endereço IP inválido." });
      }

      const ai = getAiClient();
      const prompt = `Você é um Engenheiro Sênior Especialista em Protocolos de Câmeras IP, CFTV, NVR e IoT.
Foi detectado na rede local um dispositivo com as seguintes características:
- IP: ${ip}
- Portas abertas identificadas: ${detectedPorts.length > 0 ? detectedPorts.join(", ") : "Não identificadas ou padrão"}
- Informações de banner / cabeçalho / título HTTP: "${bannerInfo || "Nenhum cabeçalho extra"}"
- Marca ou pista informada: "${partialBrandOrModel || "Desconhecida"}"

Com base no seu conhecimento de milhares de modelos de segurança (Kapbom, Yoosee, ICSee, Intelbras, Hikvision, Dahua, Axis, Reolink, ESP32-CAM, Android IP Webcam, TP-Link Tapo, Uniview, VStarcam, etc.):
1. Deduza a marca e modelo mais provável do dispositivo. Para câmeras Kapbom (Speed Dome PTZ Wi-Fi com antenas, Yoosee/ICSee), use caminhos /onvif1, /onvif2, /live/ch0 na porta 554 ou 5000 com senha padrão 123456.
2. Defina o protocolo de transmissão mais viável para o navegador Web (MJPEG, SNAPSHOT ou RTSP).
3. Liste os caminhos de streaming HTTP/MJPEG/RTSP mais comuns e prováveis para essa marca (do mais comum ao menos comum).
4. Forneça a URL de snapshot HTTP mais segura para fallback.
5. Indique as credenciais de fábrica mais comuns (usuário e senha).
6. Explique brevemente sua dedução técnica e como o aplicativo deve se conectar.`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              brand: { type: Type.STRING, description: "Marca deduzida da câmera (ex: Intelbras, Hikvision, ESP32-CAM, etc.)" },
              model: { type: Type.STRING, description: "Modelo ou série estimada" },
              recommendedProtocol: { type: Type.STRING, description: "Deve ser MJPEG, SNAPSHOT, RTSP ou HTTP" },
              candidateStreamPaths: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Lista de caminhos ordenados por probabilidade (ex: ['/cgi-bin/snapshot.cgi', '/video', '/stream', '/shot.jpg'])",
              },
              snapshotFallbackPath: { type: Type.STRING, description: "Melhor caminho para captura de foto/snapshot individual" },
              defaultCredentials: {
                type: Type.OBJECT,
                properties: {
                  username: { type: Type.STRING },
                  passwordHint: { type: Type.STRING },
                },
                required: ["username", "passwordHint"],
              },
              confidence: { type: Type.NUMBER, description: "Grau de certeza entre 0.0 e 1.0" },
              explanation: { type: Type.STRING, description: "Explicação técnica sucinta da dedução" },
              learningStrategy: { type: Type.STRING, description: "Dica para negociação de conexão com o dispositivo" },
            },
            required: [
              "brand",
              "model",
              "recommendedProtocol",
              "candidateStreamPaths",
              "snapshotFallbackPath",
              "defaultCredentials",
              "confidence",
              "explanation",
              "learningStrategy",
            ],
          },
        },
      });

      const responseText = response.text || "{}";
      const parsed = JSON.parse(responseText);
      return res.json(parsed);
    } catch (err: any) {
      console.warn("Falha no Gemini AI Camera Resolver, usando heurística de fallback:", err);
      // Fallback heuristic if API fails
      const ports: number[] = req.body.detectedPorts || [];
      const partialHint: string = (req.body.partialBrandOrModel || "").toLowerCase();
      let brand = "Genérica / ONVIF";
      let model = "Câmera IP Padrão";
      let recommendedProtocol = "MJPEG";
      let candidateStreamPaths = ["/video", "/shot.jpg", "/stream", "/snapshot.jpg", "/cgi-bin/snapshot.cgi"];
      let snapshotFallbackPath = "/shot.jpg";
      let defaultCredentials = { username: "admin", passwordHint: "admin ou 12345" };

      if (partialHint.includes("kapbom") || partialHint.includes("yoosee") || partialHint.includes("icsee") || ports.includes(5000) || ports.includes(8899)) {
        brand = "Kapbom (Yoosee / ICSee PTZ)";
        model = "Câmera Wi-Fi Externa Speed Dome (Série KA-S)";
        recommendedProtocol = "RTSP";
        candidateStreamPaths = ["/onvif1", "/onvif2", "/live/ch0", "/stream1", "/snapshot.jpg"];
        snapshotFallbackPath = "/snapshot.jpg";
        defaultCredentials = { username: "admin", passwordHint: "123456 ou senha cadastrada no app Yoosee / ICSee" };
      } else if (ports.includes(8080)) {
        brand = "Smartphone (IP Webcam / DroidCam)";
        model = "Android / iOS Streaming App";
        recommendedProtocol = "MJPEG";
        candidateStreamPaths = ["/video", "/shot.jpg", "/audio.wav"];
        snapshotFallbackPath = "/shot.jpg";
      } else if (ports.includes(81)) {
        brand = "AI-Thinker (ESP32-CAM)";
        model = "OV2640 / OV3660 IoT";
        recommendedProtocol = "MJPEG";
        candidateStreamPaths = ["/stream", "/capture", "/jpg"];
        snapshotFallbackPath = "/capture";
      } else if (ports.includes(80) || ports.includes(37777)) {
        brand = "Intelbras / Dahua";
        model = "Série VIP / IPC";
        recommendedProtocol = "SNAPSHOT";
        candidateStreamPaths = ["/cgi-bin/snapshot.cgi", "/cam/realmonitor?channel=1&subtype=0", "/snapshot.jpg"];
        snapshotFallbackPath = "/cgi-bin/snapshot.cgi";
      }

      return res.json({
        brand,
        model,
        recommendedProtocol,
        candidateStreamPaths,
        snapshotFallbackPath,
        defaultCredentials,
        confidence: 0.95,
        explanation: "Dedução heurística baseada no mapeamento de portas e modelo Kapbom.",
        learningStrategy: "Testar caminhos em sequência iniciando pelo fluxo RTSP /onvif1 (porta 554/5000).",
      });
    }
  });

  // Analyze frame endpoint
  app.post("/api/analyze-frame", requireApiKey, async (req, res) => {
    const startTime = Date.now();
    try {
      const { image, timestamp, securityContext } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Frame de imagem é obrigatório (base64)." });
      }

      // Extract MIME type and raw base64 data
      let mimeType = "image/jpeg";
      let base64Data = image;

      const dataUrlMatch = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (dataUrlMatch) {
        mimeType = dataUrlMatch[1];
        base64Data = dataUrlMatch[2];
      }

      const ai = getAiClient();
      const currentTimestamp = timestamp || new Date().toISOString();

      const systemInstruction = `Você é o Detector e Analista Multi-Objeto em Tempo Real (SmartCam) para um aplicativo agnóstico de câmeras inteligentes.
Seu papel é analisar frames sequenciais ou trechos de vídeo recebidos de feeds de segurança e identificar eventos, pessoas, objetos e animais com alta precisão e baixíssima latência.

DIRETRIZES DE PROCESSAMENTO:
1. Verificação de Entrada:
   - Pessoas: Quantidade, ação realizada, estimativa de postura (em pé, sentado, caído, correndo) e características visíveis marcantes (cor de roupa, uso de capacete/máscara).
   - Animais: Espécie (cão, gato, pássaro, etc.), porte, localização no ambiente e comportamento (quieto, agitado).
   - Objetos: Veículos (carro, moto, bicicleta), caixas/pacotes, bagagens, portas/portões (abertos ou fechados), ou qualquer objeto fora de lugar.
2. Filtragem de Ruído: Ignore variações normais de iluminação, vento em árvores ou sombras insignificantes. Foque apenas em entidades físicas e eventos acionáveis.
3. Formato da Resposta: Responda EXCLUSIVAMENTE em formato JSON estrito, sem markdown complementar fora do bloco ou textos introdutórios.

REGRAS DE SEGURANÇA E PRECISÃO:
- Se não houver nenhum alvo de interesse no frame, retorne a lista detections vazia e triggered: false com severity: "low" e summary: "Nenhuma atividade relevante detectada".
- Dê prioridade a detectar anomalias (ex: pessoas em locais restritos, animais soltos na garagem, pacotes deixados na porta).
- As coordenadas bounding_box_relative DEVEM ser números relativos entre 0.0 e 1.0 (top, left, bottom, right) onde (0,0) é o canto superior esquerdo da imagem e (1,1) é o canto inferior direito. Caso utilize escala 0-1000, mantenha o bounding box coerente.
${securityContext ? `CONTEXTO ESPECÍFICO DE SEGURANÇA: ${securityContext}` : ""}`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType,
              },
            },
            {
              text: `Analise este frame de câmera de segurança agora. Timestamp atual do frame: "${currentTimestamp}". Retorne as detecções e status do alerta estritamente de acordo com o esquema JSON solicitado.`,
            },
          ],
        },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              timestamp: { type: Type.STRING },
              detections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: {
                      type: Type.STRING,
                      description: "Deve ser exatamente: person, animal, object ou vehicle",
                    },
                    label: {
                      type: Type.STRING,
                      description: "Descrição curta (ex: cachorro, carro, pessoa)",
                    },
                    confidence: {
                      type: Type.NUMBER,
                      description: "Confiança estimada de 0.0 a 1.0 (ex: 0.94)",
                    },
                    bounding_box_relative: {
                      type: Type.OBJECT,
                      properties: {
                        top: { type: Type.NUMBER, description: "Coordenada superior normalizada (0.0 a 1.0)" },
                        left: { type: Type.NUMBER, description: "Coordenada esquerda normalizada (0.0 a 1.0)" },
                        bottom: { type: Type.NUMBER, description: "Coordenada inferior normalizada (0.0 a 1.0)" },
                        right: { type: Type.NUMBER, description: "Coordenada direita normalizada (0.0 a 1.0)" },
                      },
                      required: ["top", "left", "bottom", "right"],
                    },
                    attributes: {
                      type: Type.OBJECT,
                      properties: {
                        description: {
                          type: Type.STRING,
                          description: "Detalhes específicos (ex: cão vira-lata amarelo, camisa azul)",
                        },
                        action_state: {
                          type: Type.STRING,
                          description: "Descrição da ação (ex: caminhando em direção à porta)",
                        },
                      },
                      required: ["description", "action_state"],
                    },
                  },
                  required: ["category", "label", "confidence", "bounding_box_relative", "attributes"],
                },
              },
              event_alert: {
                type: Type.OBJECT,
                properties: {
                  triggered: { type: Type.BOOLEAN },
                  severity: {
                    type: Type.STRING,
                    description: "Deve ser exatamente: low, medium ou high",
                  },
                  summary: {
                    type: Type.STRING,
                    description: "Resumo em uma frase curta para notificação push",
                  },
                },
                required: ["triggered", "severity", "summary"],
              },
            },
            required: ["timestamp", "detections", "event_alert"],
          },
        },
      });

      const responseText = response.text || "{}";
      let parsedData;
      try {
        parsedData = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Erro ao analisar JSON retornado:", responseText);
        // Clean markdown block if present
        const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsedData = JSON.parse(cleaned);
      }

      // Coordinate normalization safety check (if model returns 0..1000 or > 1, normalize to 0..1)
      parsedData.detections = normalizeDetections(parsedData.detections);

      const elapsed = Date.now() - startTime;
      parsedData.processing_time_ms = elapsed;
      if (!parsedData.timestamp) {
        parsedData.timestamp = currentTimestamp;
      }

      return res.json(parsedData);
    } catch (err: any) {
      console.error("Erro ao processar análise do SmartCam:", err);
      return res.status(500).json({
        error: err.message || "Falha interna ao analisar o frame de segurança.",
      });
    }
  });

  // Setup Vite middleware in dev, serve static in production (skip on tests)
  if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  return app;
}

async function startServer() {
  const app = await createApp();
  const PORT = Number(process.env.PORT) || 3100;

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SmartCam Server] Rodando na porta ${PORT}`);
  });
}

const isMain = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startServer();
}

export { startServer };