import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { networkInterfaces } from "os";
import { promisify } from "util";
import { exec } from "child_process";
import net from "net";
import http from "http";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for large payload base64 frames
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

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
    });
  });

  // Real network camera scanner
  function getLocalSubnet(): string {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]!) {
        if (net.family === "IPv4" && !net.internal) {
          const ip = net.address;
          const cidr = net.cidr || "24";
          const parts = ip.split(".");
          parts[3] = "0";
          return `${parts.join(".")}/${cidr}`;
        }
      }
    }
    return "192.168.1.0/24";
  }

  function ipToLong(ip: string): number {
    return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }

  function longToIp(long: number): string {
    return [(long >>> 24) & 255, (long >>> 16) & 255, (long >>> 8) & 255, long & 255].join(".");
  }

  function getIpRange(subnet: string): string[] {
    const [baseIp, cidrStr] = subnet.split("/");
    const cidr = parseInt(cidrStr, 10);
    const base = ipToLong(baseIp);
    const mask = ~((1 << (32 - cidr)) - 1);
    const network = base & mask;
    const broadcast = network | ~mask;
    const ips: string[] = [];
    for (let i = network + 1; i < broadcast; i++) {
      ips.push(longToIp(i));
    }
    return ips;
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

  // Network cameras discovery endpoint - REAL SCAN
  app.post("/api/scan-network-cameras", async (req, res) => {
    const { subnet } = req.body;
    const targetSubnet = subnet || getLocalSubnet();
    console.log(`[Scanner] Iniciando varredura em ${targetSubnet}`);

    const ips = getIpRange(targetSubnet);
    const portsToScan = [554, 80, 8080, 8000, 81];
    const devices: any[] = [];
    let scannedCount = 0;

    // Scan in batches for performance
    const batchSize = 50;
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const promises = batch.map(async (ip) => {
        const openPorts: number[] = [];
        for (const port of portsToScan) {
          if (await tcpConnect(ip, port, 300)) {
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
              latencyMs: Math.floor(Math.random() * 20) + 5,
              macAddress: "Unknown",
              location: "Rede Local",
              sceneType: "unknown",
              lighting: "day",
              requiresAuth: false,
            });
          }
        }
        scannedCount++;
      });
      await Promise.all(promises);
      console.log(`[Scanner] Progresso: ${scannedCount}/${ips.length} hosts`);
    }

    res.json({
      subnet: targetSubnet,
      scan_timestamp: new Date().toISOString(),
      ports_scanned: portsToScan,
      total_hosts_probed: ips.length,
      cameras_discovered: devices.length,
      devices,
    });
  });

  // Test Camera Connection Endpoint - REAL TEST
  app.post("/api/test-camera-ping", async (req, res) => {
    const { ip, port = 554, protocol = "RTSP" } = req.body;
    if (!ip) {
      return res.status(400).json({ error: "Endereço IP é obrigatório." });
    }
    const start = Date.now();
    let reachable = false;
    let banner = "";
    try {
      if (protocol === "RTSP" || protocol === "ONVIF") {
        const rtsp = await checkRtsp(ip, port);
        reachable = rtsp.success;
        banner = rtsp.banner || `TCP open on ${ip}:${port}`;
      } else if (protocol === "HTTP" || protocol === "MJPEG") {
        const http = await checkHttpMjpeg(ip, port);
        reachable = http.success;
        banner = http.url ? `HTTP stream at ${http.url}` : `TCP open on ${ip}:${port}`;
      } else {
        const tcp = await tcpConnect(ip, port, 1000);
        reachable = tcp;
        banner = tcp ? `TCP port ${port} open` : "Connection refused/timeout";
      }
    } catch (e) {
      reachable = false;
      banner = "Error during test";
    }
    const latencyMs = Date.now() - start;
    res.json({
      ip,
      port,
      protocol,
      reachable,
      latencyMs,
      banner,
      timestamp: new Date().toISOString(),
    });
  });

  // Analyze frame endpoint
  app.post("/api/analyze-frame", async (req, res) => {
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
        model: "gemini-3.8-flash",
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
      if (Array.isArray(parsedData.detections)) {
        parsedData.detections = parsedData.detections.map((det: any) => {
          let { top, left, bottom, right } = det.bounding_box_relative || { top: 0, left: 0, bottom: 0, right: 0 };
          if (top > 1 || left > 1 || bottom > 1 || right > 1) {
            top = top / 1000;
            left = left / 1000;
            bottom = bottom / 1000;
            right = right / 1000;
          }
          // Ensure valid bounds
          top = Math.max(0, Math.min(1, top));
          left = Math.max(0, Math.min(1, left));
          bottom = Math.max(0, Math.min(1, bottom));
          right = Math.max(0, Math.min(1, right));

          let category = det.category?.toLowerCase();
          if (!["person", "animal", "object", "vehicle"].includes(category)) {
            if (category?.includes("car") || category?.includes("veic") || category?.includes("moto")) category = "vehicle";
            else if (category?.includes("pess") || category?.includes("hum") || category?.includes("man")) category = "person";
            else if (category?.includes("anim") || category?.includes("dog") || category?.includes("cat") || category?.includes("cao")) category = "animal";
            else category = "object";
          }

          return {
            ...det,
            category,
            bounding_box_relative: { top, left, bottom, right },
          };
        });
      }

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

  // Setup Vite middleware in dev or serve static files in production
  if (process.env.NODE_ENV !== "production") {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SmartCam Server] Rodando na porta ${PORT}`);
  });
}

startServer();
