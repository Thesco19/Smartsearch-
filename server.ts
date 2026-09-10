import express, { Request, Response } from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { AnalysisRequest, AnalysisResponse } from "./src/types";
import { normalizeDetections } from "./src/utils/detection";

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

  app.post("/api/analyze-frame", async (req: Request<{}, {}, AnalysisRequest>, res: Response<AnalysisResponse>) => {
    const startTime = Date.now();
    try {
      const { image, securityContext } = req.body;
      if (!image) {
        return res.status(400).json({ 
          timestamp: new Date().toISOString(), 
          detections: [], 
          event_alert: { triggered: false, severity: 'low', summary: 'Missing image data' }, 
          error: "Frame required" 
        });
      }

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
      const normalized: AnalysisResponse = {
        ...parsed,
        detections: normalizeDetections(parsed.detections || []),
        processing_time_ms: Date.now() - startTime
      };
      
      res.json(normalized);
    } catch (err: any) {
      console.error("Analysis error:", err);
      res.status(500).json({ 
        timestamp: new Date().toISOString(), 
        detections: [], 
        event_alert: { triggered: false, severity: 'low', summary: 'Analysis failed' }, 
        error: err.message || "Internal server error" 
      });
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
