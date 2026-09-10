import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  const getAiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing.");
    return new GoogleGenAI({ apiKey, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
  };

  const normalizeDetections = (detections: any[]) => {
    return detections.map((det: any) => {
      let { top, left, bottom, right } = det.bounding_box_relative || { top: 0, left: 0, bottom: 0, right: 0 };
      if (top > 1) [top, left, bottom, right] = [top, left, bottom, right].map(v => v / 1000);
      
      let category = det.category?.toLowerCase();
      const valid = ["person", "animal", "object", "vehicle"];
      if (!valid.includes(category)) {
        if (category?.match(/car|veic|moto/)) category = "vehicle";
        else if (category?.match(/pess|hum|man/)) category = "person";
        else if (category?.match(/anim|dog|cat|cao/)) category = "animal";
        else category = "object";
      }

      return {
        ...det,
        category,
        bounding_box_relative: {
          top: Math.max(0, Math.min(1, top)),
          left: Math.max(0, Math.min(1, left)),
          bottom: Math.max(0, Math.min(1, bottom)),
          right: Math.max(0, Math.min(1, right)),
        }
      };
    });
  };

  app.post("/api/analyze-frame", async (req, res) => {
    const startTime = Date.now();
    try {
      const { image, securityContext } = req.body;
      if (!image) return res.status(400).json({ error: "Frame required" });

      const match = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      const mimeType = match ? match[1] : "image/jpeg";
      const base64Data = match ? match[2] : image;

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: { parts: [{ inlineData: { data: base64Data, mimeType } }, { text: "Analyze this security frame." }] },
        config: {
          systemInstruction: `SmartCam Analysis. Return JSON. Context: ${securityContext || "None"}`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              timestamp: { type: Type.STRING },
              detections: { type: Type.ARRAY, items: { type: Type.OBJECT } },
              event_alert: { type: Type.OBJECT }
            },
            required: ["timestamp", "detections", "event_alert"]
          }
        }
      });

      const parsed = JSON.parse(response.text || "{}");
      if (parsed.detections) parsed.detections = normalizeDetections(parsed.detections);
      
      res.json({ ...parsed, processing_time_ms: Date.now() - startTime });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`[Server] Running on ${PORT}`));
}

startServer();
