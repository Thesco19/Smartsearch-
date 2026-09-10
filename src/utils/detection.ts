import { SmartCamDetection } from "../types";

export const normalizeDetections = (detections: any[]): SmartCamDetection[] => {
  if (!Array.isArray(detections)) return [];
  
  return detections.map((det: any) => {
    let { top, left, bottom, right } = det.bounding_box_relative || { top: 0, left: 0, bottom: 0, right: 0 };
    
    if (top > 1) [top, left, bottom, right] = [top, left, bottom, right].map(v => v / 1000);
    
    let category = (det.category || "").toLowerCase();
    const valid = ["person", "animal", "object", "vehicle"];
    
    if (!valid.includes(category)) {
      if (category.match(/car|veic|moto/)) category = "vehicle";
      else if (category.match(/pess|hum|man/)) category = "person";
      else if (category.match(/anim|dog|cat|cao/)) category = "animal";
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
      },
      attributes: det.attributes || { description: "", action_state: "" }
    };
  });
};
