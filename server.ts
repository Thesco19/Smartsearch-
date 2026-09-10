import express from "express";
import path from "path";
import net from "net";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

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

  // Network cameras discovery simulation endpoint
  app.post("/api/scan-network-cameras", (req, res) => {
    const { subnet = "192.168.1.0/24" } = req.body;
    
    // Discovered cameras matching security CCTV equipment
    const devices = [
      {
        id: "cam-lan-01",
        name: "CAM-01 [Portaria / Entrada Principal]",
        brand: "Hikvision",
        model: "DS-2CD2043G2-I (AcuSense 4MP)",
        ip: "192.168.1.101",
        port: 554,
        protocol: "ONVIF",
        streamUrl: "rtsp://admin:****@192.168.1.101:554/Streaming/Channels/101",
        resolution: "2560x1440 (2K QHD)",
        fps: 30,
        status: "online",
        latencyMs: 8,
        macAddress: "BC:54:51:A4:12:88",
        location: "Portão Frontal e Acesso de Pedestres",
        sceneType: "porch",
        lighting: "day",
        requiresAuth: true,
        username: "admin",
      },
      {
        id: "cam-lan-02",
        name: "CAM-02 [Perímetro Noturno / Gradil]",
        brand: "Intelbras",
        model: "VIP 3230 B (Starlight IR 30m)",
        ip: "192.168.1.102",
        port: 554,
        protocol: "ONVIF",
        streamUrl: "rtsp://admin:****@192.168.1.102:554/cam/realmonitor?channel=1&subtype=0",
        resolution: "1920x1080 (Full HD)",
        fps: 30,
        status: "online",
        latencyMs: 12,
        macAddress: "48:EE:0C:5E:33:10",
        location: "Perímetro Sul / Muro dos Fundos",
        sceneType: "backyard",
        lighting: "night_ir",
        requiresAuth: true,
        username: "admin",
      },
      {
        id: "cam-lan-03",
        name: "CAM-03 [Garagem Subsolo / Vagas]",
        brand: "Dahua",
        model: "IPC-HFW2431S-S-S2 (WDR 4MP)",
        ip: "192.168.1.105",
        port: 554,
        protocol: "RTSP",
        streamUrl: "rtsp://admin:****@192.168.1.105:554/live",
        resolution: "2688x1520",
        fps: 25,
        status: "online",
        latencyMs: 14,
        macAddress: "3C:EF:8C:11:42:9A",
        location: "Área de Estacionamento e Manobra",
        sceneType: "garage",
        lighting: "day",
        requiresAuth: true,
        username: "admin",
      },
      {
        id: "cam-lan-04",
        name: "CAM-04 [Corredor Interno / Circulação]",
        brand: "Reolink",
        model: "RLC-810A (Smart 4K PoE)",
        ip: "192.168.1.108",
        port: 554,
        protocol: "ONVIF",
        streamUrl: "rtsp://admin:****@192.168.1.108:554/h264Preview_01_main",
        resolution: "3840x2160 (4K UHD)",
        fps: 25,
        status: "online",
        latencyMs: 9,
        macAddress: "EC:71:DB:23:76:E0",
        location: "Hall Central e Elevadores",
        sceneType: "hallway",
        lighting: "day",
        requiresAuth: true,
        username: "admin",
      },
      {
        id: "cam-lan-05",
        name: "CAM-05 [Área de Descarga / Docas]",
        brand: "Axis",
        model: "M3057-PLVE (Fisheye 6MP)",
        ip: "192.168.1.115",
        port: 80,
        protocol: "HTTP",
        streamUrl: "http://192.168.1.115/axis-cgi/mjpg/video.cgi",
        resolution: "2048x2048 (360°)",
        fps: 20,
        status: "auth_required",
        latencyMs: 18,
        macAddress: "AC:CC:8E:44:91:0F",
        location: "Docas de Carga e Almoxarifado",
        sceneType: "backyard",
        lighting: "day",
        requiresAuth: true,
        username: "root",
      },
      {
        id: "cam-lan-06",
        name: "CAM-06 [ESP32-CAM / Sensor IoT]",
        brand: "AI-Thinker",
        model: "ESP32-CAM OV2640",
        ip: "192.168.1.140",
        port: 81,
        protocol: "MJPEG",
        streamUrl: "http://192.168.1.140:81/stream",
        resolution: "1280x720 (HD)",
        fps: 15,
        status: "online",
        latencyMs: 24,
        macAddress: "24:6F:28:B1:4C:E2",
        location: "Caixa de Correio Inteligente",
        sceneType: "porch",
        lighting: "day",
        requiresAuth: false,
      },
    ];

    res.json({
      subnet,
      scan_timestamp: new Date().toISOString(),
      ports_scanned: [554, 80, 8080, 8000, 81],
      total_hosts_probed: 254,
      cameras_discovered: devices.length,
      devices,
    });
  });

  // Real Camera TCP Socket Ping Endpoint
  app.post("/api/test-camera-ping", async (req, res) => {
    const { ip, port = 554, protocol = "RTSP" } = req.body;
    if (!ip) {
      return res.status(400).json({ error: "Endereço IP é obrigatório." });
    }

    const numPort = Number(port) || 554;
    // Perform real TCP probe
    const probe = await probeTcpSocket(ip, numPort, 1200);

    res.json({
      ip,
      port: numPort,
      protocol,
      reachable: probe.reachable,
      hostAlive: probe.hostAlive,
      latencyMs: probe.latencyMs,
      banner: probe.reachable
        ? `Porta TCP ${numPort} ABERTA em ${ip} (Latência: ${probe.latencyMs}ms)`
        : probe.hostAlive
        ? `Host ${ip} respondeu, mas a porta ${numPort} está FECHADA (TCP RST - ${probe.latencyMs}ms)`
        : `Host ${ip}:${numPort} não respondeu (timeout após ${probe.latencyMs}ms)`,
      error: probe.error,
      timestamp: new Date().toISOString(),
    });
  });

  // Real Multi-Port Scan Endpoint (TCP Sockets)
  app.post("/api/scan-tcp-ports", async (req, res) => {
    const { ip, ports = [554, 5000, 8899, 80, 8080, 81] } = req.body;
    if (!ip) {
      return res.status(400).json({ error: "Endereço IP é obrigatório." });
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

  app.post("/api/save-scan-log", (req, res) => {
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
  app.get("/api/proxy-camera-snapshot", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).json({ error: "Parâmetro 'url' é obrigatório." });
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
  app.post("/api/ai-resolve-camera-config", async (req, res) => {
    try {
      const { ip, detectedPorts = [], bannerInfo = "", partialBrandOrModel = "" } = req.body;

      if (!ip) {
        return res.status(400).json({ error: "O endereço IP é obrigatório." });
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
        model: "gemini-3.8-flash",
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
