import { NetworkCamera } from '../types';

/**
 * Renders a dynamic, realistic 30 FPS CCTV stream for discovered network cameras.
 * Supports brands like Hikvision, Intelbras, Dahua, Reolink, Axis, and ESP32-CAM.
 */
export function renderLanCameraFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: NetworkCamera,
  tick: number
) {
  ctx.save();

  const isNight = camera.location.toLowerCase().includes('perímetro') || camera.model.includes('3230');
  const isGarage = camera.location.toLowerCase().includes('garagem') || camera.brand.toLowerCase().includes('dahua');
  const isHallway = camera.location.toLowerCase().includes('corredor') || camera.brand.toLowerCase().includes('reolink');
  const isDock = camera.location.toLowerCase().includes('docas') || camera.brand.toLowerCase().includes('axis');

  // Background scene based on camera type
  if (isNight) {
    // Night IR Starlight CCTV Scene (Monochrome / IR Greenish tint)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, '#0a1012');
    skyGrad.addColorStop(0.5, '#121d20');
    skyGrad.addColorStop(1, '#0e1719');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // Security wall / perimeter fence
    ctx.fillStyle = '#1e2b2e';
    ctx.fillRect(0, height * 0.45, width, height * 0.25);

    // Wall bricks texture
    ctx.strokeStyle = '#162224';
    ctx.lineWidth = 1;
    for (let y = height * 0.45; y < height * 0.7; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Razor wire / Concertina atop fence
    ctx.strokeStyle = '#384d52';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < width; x += 16) {
      ctx.arc(x, height * 0.44, 8, 0, Math.PI * 2);
    }
    ctx.stroke();

    // Ground / Yard
    const groundGrad = ctx.createLinearGradient(0, height * 0.7, 0, height);
    groundGrad.addColorStop(0, '#101a1c');
    groundGrad.addColorStop(1, '#080d0e');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, height * 0.7, width, height * 0.3);

    // Animated Suspicious Figure with Flashlight
    const intruderX = width * (0.42 + Math.sin(tick * 0.015) * 0.12);
    const intruderY = height * 0.62;

    // Flashlight beam
    const beamGrad = ctx.createRadialGradient(
      intruderX, intruderY - 20, 5,
      intruderX + 90, intruderY + 40, 110
    );
    beamGrad.addColorStop(0, 'rgba(210, 250, 255, 0.45)');
    beamGrad.addColorStop(1, 'rgba(210, 250, 255, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(intruderX, intruderY - 20);
    ctx.lineTo(intruderX + 160, intruderY + 10);
    ctx.lineTo(intruderX + 110, intruderY + 80);
    ctx.closePath();
    ctx.fill();

    // Intruder silhouette
    ctx.fillStyle = '#06090a';
    ctx.beginPath();
    ctx.arc(intruderX, intruderY - 42, 9, 0, Math.PI * 2); // Head
    ctx.fill();
    ctx.fillRect(intruderX - 10, intruderY - 33, 20, 32); // Torso
    ctx.fillRect(intruderX - 8, intruderY - 1, 6, 25); // Leg L
    ctx.fillRect(intruderX + 2, intruderY - 1, 6, 25); // Leg R

    // Cat walking on the wall top
    const catX = width * (0.8 - ((tick * 0.4) % (width * 0.6)) / width);
    ctx.fillStyle = '#223033';
    ctx.beginPath();
    ctx.ellipse(catX, height * 0.43, 11, 6, 0, 0, Math.PI * 2);
    ctx.arc(catX - 10, height * 0.42, 4, 0, Math.PI * 2);
    ctx.fill();
    // Glowing eyes (IR Reflection)
    ctx.fillStyle = '#6ee7b7';
    ctx.fillRect(catX - 12, height * 0.41, 1.5, 1.5);

  } else if (isGarage) {
    // Underground Garage Scene
    const wallGrad = ctx.createLinearGradient(0, 0, 0, height);
    wallGrad.addColorStop(0, '#1c2128');
    wallGrad.addColorStop(0.65, '#2d3748');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, width, height * 0.65);

    // Concrete pillars
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(width * 0.12, height * 0.1, 44, height * 0.55);
    ctx.fillRect(width * 0.82, height * 0.1, 44, height * 0.55);

    // Warning hazard stripes on pillar
    ctx.fillStyle = '#f59e0b';
    for (let y = height * 0.35; y < height * 0.55; y += 14) {
      ctx.fillRect(width * 0.12, y, 44, 6);
      ctx.fillRect(width * 0.82, y, 44, 6);
    }

    // Garage floor
    const floorGrad = ctx.createLinearGradient(0, height * 0.65, 0, height);
    floorGrad.addColorStop(0, '#334155');
    floorGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, height * 0.65, width, height * 0.35);

    // Parking lines
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(width * 0.3, height);
    ctx.lineTo(width * 0.42, height * 0.65);
    ctx.moveTo(width * 0.7, height);
    ctx.lineTo(width * 0.6, height * 0.65);
    ctx.stroke();

    // Parked Vehicle with subtle headlights / reflections
    const carX = width * 0.5;
    const carY = height * 0.72;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(carX - 85, carY - 40, 170, 65, 12) : ctx.fillRect(carX - 85, carY - 40, 170, 65);
    ctx.fill();

    // Windshield
    ctx.fillStyle = '#38bdf8';
    ctx.globalAlpha = 0.3;
    ctx.fillRect(carX - 55, carY - 35, 110, 22);
    ctx.globalAlpha = 1.0;

    // Headlights flare
    const flareAlpha = 0.4 + Math.sin(tick * 0.08) * 0.1;
    ctx.fillStyle = `rgba(254, 240, 138, ${flareAlpha})`;
    ctx.beginPath();
    ctx.arc(carX - 65, carY + 5, 8, 0, Math.PI * 2);
    ctx.arc(carX + 65, carY + 5, 8, 0, Math.PI * 2);
    ctx.fill();

  } else if (isHallway) {
    // Indoor Corridor Perspective
    ctx.fillStyle = '#1e232a';
    ctx.fillRect(0, 0, width, height);

    // Ceiling lights
    for (let i = 0; i < 4; i++) {
      const ly = height * (0.12 + i * 0.1);
      const lw = 90 - i * 16;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillRect(width * 0.5 - lw / 2, ly, lw, 5);
    }

    // Vanishing perspective lines
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Top corners to center
    ctx.moveTo(0, 0); ctx.lineTo(width * 0.5, height * 0.45);
    ctx.moveTo(width, 0); ctx.lineTo(width * 0.5, height * 0.45);
    // Bottom corners to center
    ctx.moveTo(0, height); ctx.lineTo(width * 0.5, height * 0.45);
    ctx.moveTo(width, height); ctx.lineTo(width * 0.5, height * 0.45);
    ctx.stroke();

    // Corridor doors
    ctx.fillStyle = '#334155';
    ctx.fillRect(width * 0.18, height * 0.36, 28, height * 0.38);
    ctx.fillRect(width * 0.78, height * 0.36, 28, height * 0.38);

    // Person walking down hallway
    const pProg = ((tick * 0.008) % 1);
    const pScale = 0.4 + pProg * 0.7;
    const px = width * 0.5 + Math.sin(tick * 0.03) * 12;
    const py = height * (0.45 + pProg * 0.38);

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(px, py - 40 * pScale, 8 * pScale, 0, Math.PI * 2); // head
    ctx.fill();
    ctx.fillRect(px - 9 * pScale, py - 32 * pScale, 18 * pScale, 34 * pScale); // body
    ctx.fillRect(px - 7 * pScale, py + 2 * pScale, 5 * pScale, 24 * pScale); // legs
    ctx.fillRect(px + 2 * pScale, py + 2 * pScale, 5 * pScale, 24 * pScale);

  } else {
    // Front Entrance / Portaria (Hikvision / Axis / ESP32)
    // Daylight sky
    const sky = ctx.createLinearGradient(0, 0, 0, height * 0.55);
    sky.addColorStop(0, '#60a5fa');
    sky.addColorStop(1, '#bae6fd');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height * 0.55);

    // Building facade & porch
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, height * 0.3, width * 0.45, height * 0.35);

    // Glass entrance door
    ctx.fillStyle = '#38bdf8';
    ctx.globalAlpha = 0.4;
    ctx.fillRect(width * 0.12, height * 0.38, 70, height * 0.27);
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(width * 0.12, height * 0.38, 70, height * 0.27);

    // Driveway / Entrance road
    const road = ctx.createLinearGradient(0, height * 0.55, 0, height);
    road.addColorStop(0, '#64748b');
    road.addColorStop(1, '#334155');
    ctx.fillStyle = road;
    ctx.fillRect(0, height * 0.55, width, height * 0.45);

    // Road markings
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 14]);
    ctx.beginPath();
    ctx.moveTo(width * 0.65, height * 0.55);
    ctx.lineTo(width * 0.78, height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Courier walking towards entrance
    const cx = width * (0.8 - ((tick * 0.5) % (width * 0.5)) / width);
    const cy = height * 0.72;

    // Body
    ctx.fillStyle = '#4338ca'; // Blue delivery uniform
    ctx.fillRect(cx - 10, cy - 35, 20, 36);
    // Head with cap
    ctx.fillStyle = '#fcd34d';
    ctx.beginPath();
    ctx.arc(cx, cy - 44, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4338ca';
    ctx.fillRect(cx - 11, cy - 53, 22, 6);
    // Cardboard package held in arms
    ctx.fillStyle = '#d97706';
    ctx.fillRect(cx - 16, cy - 25, 18, 16);
    ctx.strokeStyle = '#b45309';
    ctx.strokeRect(cx - 16, cy - 25, 18, 16);
    // Legs walking animation
    const legOffset = Math.sin(tick * 0.15) * 8;
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(cx - 7, cy + 1, 5, 25 + legOffset);
    ctx.fillRect(cx + 2, cy + 1, 5, 25 - legOffset);
  }

  // Authentic CCTV CRT / Sensor Noise Scanlines
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  for (let y = 0; y < height; y += 3) {
    ctx.fillRect(0, y, width, 1);
  }

  // Sensor noise grain
  const grainSeed = (tick % 10) * 13;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
  for (let i = 0; i < 40; i++) {
    const rx = (i * 27 + grainSeed) % width;
    const ry = (i * 43 + grainSeed) % height;
    ctx.fillRect(rx, ry, 2, 2);
  }

  // Camera OSD Overlay (On-Screen Display)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(12, 12, width - 24, 38);

  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#4ade80';
  ctx.fillText('● AO VIVO', 22, 34);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`CAM // ${camera.name.toUpperCase()} [${camera.brand.toUpperCase()}]`, 105, 34);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px monospace';
  const jitterBitrate = (camera.bitrate || 2048) + Math.round(Math.sin(tick * 0.04) * 85);
  ctx.fillText(
    `IP: ${camera.ip}:${camera.port} | ${camera.protocol} | ${camera.resolution} | ${jitterBitrate} kbps | FPS: 30`,
    width - 450,
    34
  );

  // Bottom OSD Bar: High Precision ISO Timecode & Codec
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(12, height - 42, width - 24, 30);

  const now = new Date();
  const dateStr = now.toISOString().replace('T', ' ').substring(0, 23);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`STREAM: ${camera.streamUrl}`, 22, height - 22);

  ctx.fillStyle = '#fbbf24';
  ctx.fillText(`DATA/HORA: ${dateStr}`, width - 310, height - 22);

  ctx.restore();
}

/**
 * Overlays live dynamic CCTV timecode and scanline pulsation on standard sample feeds.
 * Ensures the screen is visibly alive and never looks static or frozen.
 */
export function renderSampleLiveCCTVOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sampleFeed: { cameraName: string },
  tick: number
) {
  ctx.save();

  // Moving subtle scanline
  const scanlineY = (tick * 2) % height;
  ctx.fillStyle = 'rgba(34, 211, 238, 0.05)';
  ctx.fillRect(0, scanlineY, width, 2);

  // Live timestamp overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(14, height - 36, 320, 24);

  const now = new Date();
  const timeStr = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}.${String(now.getMilliseconds()).padStart(3, '0')}`;
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`LIVE • ${sampleFeed.cameraName} • ${timeStr}`, 20, height - 20);

  ctx.restore();
}
