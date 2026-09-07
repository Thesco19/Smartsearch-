export interface SampleFeed {
  id: string;
  name: string;
  cameraName: string;
  location: string;
  description: string;
  renderToCanvas: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

export const sampleFeeds: SampleFeed[] = [
  {
    id: "porch-package",
    name: "Entrada & Pacote",
    cameraName: "CAM-01 [PORTARIA FRONTAL]",
    location: "Varanda Principal",
    description: "Entregador com uniforme deixando pacote de entrega na porta de entrada.",
    renderToCanvas: (ctx, w, h) => {
      // Background porch wall & floor
      const wallGrad = ctx.createLinearGradient(0, 0, 0, h * 0.7);
      wallGrad.addColorStop(0, "#cbd5e1");
      wallGrad.addColorStop(1, "#94a3b8");
      ctx.fillStyle = wallGrad;
      ctx.fillRect(0, 0, w, h * 0.7);

      // Floor tiles
      const floorGrad = ctx.createLinearGradient(0, h * 0.7, 0, h);
      floorGrad.addColorStop(0, "#64748b");
      floorGrad.addColorStop(1, "#334155");
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, h * 0.7, w, h * 0.3);

      // Wooden Front Door
      const doorX = w * 0.15;
      const doorY = h * 0.15;
      const doorW = w * 0.28;
      const doorH = h * 0.55;
      ctx.fillStyle = "#78350f";
      ctx.fillRect(doorX, doorY, doorW, doorH);
      ctx.strokeStyle = "#451a03";
      ctx.lineWidth = 4;
      ctx.strokeRect(doorX, doorY, doorW, doorH);

      // Door handle
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(doorX + doorW * 0.85, doorY + doorH * 0.52, 6, 0, Math.PI * 2);
      ctx.fill();

      // Cardboard package on the floor in front of door
      const boxX = w * 0.26;
      const boxY = h * 0.65;
      const boxW = w * 0.16;
      const boxH = h * 0.14;
      ctx.fillStyle = "#d97706";
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = "#92400e";
      ctx.lineWidth = 2;
      ctx.strokeRect(boxX, boxY, boxW, boxH);
      // Tape on package
      ctx.fillStyle = "#fef3c7";
      ctx.fillRect(boxX + boxW * 0.4, boxY, boxW * 0.2, boxH);

      // Courier person walking away towards right
      const personX = w * 0.65;
      const personY = h * 0.28;
      // Head with cap
      ctx.fillStyle = "#fbcfe8";
      ctx.beginPath();
      ctx.arc(personX, personY, 18, 0, Math.PI * 2);
      ctx.fill();
      // Cap
      ctx.fillStyle = "#1e3a8a";
      ctx.beginPath();
      ctx.arc(personX, personY - 4, 19, Math.PI, 0, false);
      ctx.fill();
      ctx.fillRect(personX - 5, personY - 6, 28, 6);

      // Blue jacket torso
      ctx.fillStyle = "#1e40af";
      ctx.fillRect(personX - 22, personY + 18, 44, 75);
      // Dark trousers
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(personX - 20, personY + 93, 18, 80);
      ctx.fillRect(personX + 2, personY + 93, 18, 75);
      // Clipboard/Smartphone in hand
      ctx.fillStyle = "#111827";
      ctx.fillRect(personX + 22, personY + 50, 12, 18);
    },
  },
  {
    id: "backyard-night",
    name: "Perímetro Noturno",
    cameraName: "CAM-02 [QUINTAL / MURO FUNDOS]",
    location: "Perímetro Traseiro",
    description: "Cenário noturno com infravermelho: indivíduo em atitude suspeita próximo ao portão.",
    renderToCanvas: (ctx, w, h) => {
      // Night IR monochrome security tint
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, w, h);

      // Night fence background
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, h * 0.2, w, h * 0.5);

      // Vertical fence rails
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 4;
      for (let x = 0; x < w; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, h * 0.2);
        ctx.lineTo(x, h * 0.7);
        ctx.stroke();
      }

      // Ground grass
      ctx.fillStyle = "#09121d";
      ctx.fillRect(0, h * 0.7, w, h * 0.3);

      // Metal gate open slightly
      ctx.fillStyle = "#475569";
      ctx.fillRect(w * 0.45, h * 0.22, w * 0.22, h * 0.48);

      // Suspect person wearing dark hoodie and face mask
      const pX = w * 0.52;
      const pY = h * 0.32;
      // Dark hooded head
      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.arc(pX, pY, 20, 0, Math.PI * 2);
      ctx.fill();
      // Mask
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(pX - 10, pY - 2, 20, 12);
      // Dark hoodie body
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(pX - 25, pY + 20, 50, 85);
      // Legs
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(pX - 23, pY + 105, 20, 75);
      ctx.fillRect(pX + 3, pY + 105, 20, 78);
      // Flashlight beam
      const lightGrad = ctx.createRadialGradient(pX - 30, pY + 120, 5, pX - 80, pY + 140, 100);
      lightGrad.addColorStop(0, "rgba(255, 255, 200, 0.4)");
      lightGrad.addColorStop(1, "rgba(255, 255, 200, 0)");
      ctx.fillStyle = lightGrad;
      ctx.beginPath();
      ctx.arc(pX - 40, pY + 130, 80, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: "garage-animal",
    name: "Garagem & Cão",
    cameraName: "CAM-03 [GARAGEM RESIDENCIAL]",
    location: "Garagem Coberta",
    description: "Carro SUV estacionado e um cachorro solto caminhando perto das rodas.",
    renderToCanvas: (ctx, w, h) => {
      // Concrete garage walls
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(0, 0, w, h * 0.65);
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(0, h * 0.65, w, h * 0.35);

      // Garage door slats at the back
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 3;
      for (let y = 30; y < h * 0.6; y += 25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Parked Car (Red SUV / Sedan)
      const carX = w * 0.08;
      const carY = h * 0.32;
      const carW = w * 0.45;
      const carH = h * 0.38;

      // Car body
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.roundRect(carX, carY + carH * 0.35, carW, carH * 0.5, 12);
      ctx.fill();
      // Car roof / cabin
      ctx.fillStyle = "#991b1b";
      ctx.beginPath();
      ctx.roundRect(carX + carW * 0.2, carY, carW * 0.6, carH * 0.45, 16);
      ctx.fill();
      // Windshield & windows
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(carX + carW * 0.25, carY + 8, carW * 0.5, carH * 0.3);

      // Car wheels
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(carX + carW * 0.22, carY + carH * 0.85, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(carX + carW * 0.82, carY + carH * 0.85, 24, 0, Math.PI * 2);
      ctx.fill();
      // Silver rims
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.arc(carX + carW * 0.22, carY + carH * 0.85, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(carX + carW * 0.82, carY + carH * 0.85, 12, 0, Math.PI * 2);
      ctx.fill();

      // Dog (golden / caramel dog)
      const dogX = w * 0.68;
      const dogY = h * 0.62;
      // Dog body
      ctx.fillStyle = "#d97706";
      ctx.beginPath();
      ctx.ellipse(dogX, dogY, 34, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      // Dog head
      ctx.beginPath();
      ctx.arc(dogX - 32, dogY - 12, 16, 0, Math.PI * 2);
      ctx.fill();
      // Snout
      ctx.fillStyle = "#78350f";
      ctx.fillRect(dogX - 48, dogY - 14, 16, 12);
      // Ears
      ctx.beginPath();
      ctx.moveTo(dogX - 30, dogY - 26);
      ctx.lineTo(dogX - 22, dogY - 10);
      ctx.lineTo(dogX - 38, dogY - 10);
      ctx.fill();
      // Legs
      ctx.fillStyle = "#b45309";
      ctx.fillRect(dogX - 20, dogY + 12, 8, 28);
      ctx.fillRect(dogX - 6, dogY + 12, 8, 26);
      ctx.fillRect(dogX + 10, dogY + 12, 8, 28);
      ctx.fillRect(dogX + 22, dogY + 12, 8, 26);
      // Tail
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(dogX + 32, dogY - 5);
      ctx.quadraticCurveTo(dogX + 48, dogY - 20, dogX + 46, dogY - 30);
      ctx.stroke();
    },
  },
  {
    id: "empty-hallway",
    name: "Corredor Interno (Vazio)",
    cameraName: "CAM-04 [CORREDOR CENTRAL]",
    location: "Hall de Acesso",
    description: "Área interna bem iluminada sem presença de pessoas, animais ou objetos anômalos.",
    renderToCanvas: (ctx, w, h) => {
      // Perspective corridor
      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(0, 0, w, h);

      // Perspective ceiling
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w * 0.7, h * 0.35);
      ctx.lineTo(w * 0.3, h * 0.35);
      ctx.closePath();
      ctx.fill();

      // Perspective floor
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(w, h);
      ctx.lineTo(w * 0.7, h * 0.65);
      ctx.lineTo(w * 0.3, h * 0.65);
      ctx.closePath();
      ctx.fill();

      // Back door at end of hall (closed)
      ctx.fillStyle = "#64748b";
      ctx.fillRect(w * 0.35, h * 0.35, w * 0.3, h * 0.3);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 2;
      ctx.strokeRect(w * 0.35, h * 0.35, w * 0.3, h * 0.3);

      // Ceiling lights
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.15, 40, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  },
];
