import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

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

  // Test Camera Connection Endpoint
  app.post("/api/test-camera-ping", (req, res) => {
    const { ip, port = 554, protocol = "RTSP" } = req.body;
    if (!ip) {
      return res.status(400).json({ error: "Endereço IP é obrigatório." });
    }
    // Simulate ping / handshake latency
    const latency = Math.floor(Math.random() * 15) + 6;
    res.json({
      ip,
      port,
      protocol,
      reachable: true,
      latencyMs: latency,
      banner: `RTSP/1.0 200 OK - ONVIF/2.0 compatible server on ${ip}:${port}`,
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
