import { SandboxSceneType, SandboxLighting, SandboxWeather, SandboxEntity } from '../types';

export function renderSandboxFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: SandboxSceneType,
  lighting: SandboxLighting,
  weather: SandboxWeather,
  entities: SandboxEntity[],
  tick: number,
  zoom: number = 1,
  panX: number = 0,
  panY: number = 0
) {
  ctx.save();

  // Clear canvas
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  // Apply PTZ (Pan / Tilt / Zoom)
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-w / 2 + panX, -h / 2 + panY);

  // 1. Draw Background Environment
  if (scene === 'porch') {
    // Porch Background
    const wallGrad = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    wallGrad.addColorStop(0, lighting === 'night_ir' ? '#1e293b' : lighting === 'dusk' ? '#f59e0b22' : '#cbd5e1');
    wallGrad.addColorStop(1, lighting === 'night_ir' ? '#0f172a' : lighting === 'dusk' ? '#78350f44' : '#94a3b8');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, w, h * 0.7);

    // Floor
    const floorGrad = ctx.createLinearGradient(0, h * 0.7, 0, h);
    floorGrad.addColorStop(0, lighting === 'night_ir' ? '#1e293b' : '#64748b');
    floorGrad.addColorStop(1, lighting === 'night_ir' ? '#09121d' : '#334155');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, h * 0.7, w, h * 0.3);

    // Front door
    const doorX = w * 0.15;
    const doorY = h * 0.15;
    const doorW = w * 0.28;
    const doorH = h * 0.55;
    ctx.fillStyle = lighting === 'night_ir' ? '#334155' : '#78350f';
    ctx.fillRect(doorX, doorY, doorW, doorH);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.strokeRect(doorX, doorY, doorW, doorH);

    // Door knob
    ctx.fillStyle = lighting === 'night_ir' ? '#cbd5e1' : '#fbbf24';
    ctx.beginPath();
    ctx.arc(doorX + doorW * 0.85, doorY + doorH * 0.52, 6, 0, Math.PI * 2);
    ctx.fill();

    // Doormat
    ctx.fillStyle = '#475569';
    ctx.fillRect(w * 0.18, h * 0.7, w * 0.22, h * 0.08);

    // House number plaque
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(doorX + doorW + 20, doorY + 30, 45, 25);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('104', doorX + doorW + 26, doorY + 48);

  } else if (scene === 'backyard') {
    // Backyard Night / Fence
    ctx.fillStyle = lighting === 'night_ir' ? '#09121d' : lighting === 'dusk' ? '#451a03' : '#0369a1';
    ctx.fillRect(0, 0, w, h * 0.35);

    // Distant trees/foliage (can sway with weather === 'windy_foliage')
    const foliageSway = weather === 'windy_foliage' ? Math.sin(tick * 0.08) * 8 : 0;
    ctx.fillStyle = lighting === 'night_ir' ? '#1e293b' : '#14532d';
    ctx.beginPath();
    ctx.arc(w * 0.15 + foliageSway, h * 0.35, 70, 0, Math.PI * 2);
    ctx.arc(w * 0.35 - foliageSway, h * 0.32, 85, 0, Math.PI * 2);
    ctx.arc(w * 0.85 + foliageSway, h * 0.35, 90, 0, Math.PI * 2);
    ctx.fill();

    // Fence
    ctx.fillStyle = lighting === 'night_ir' ? '#1e293b' : '#334155';
    ctx.fillRect(0, h * 0.35, w, h * 0.35);

    // Fence pickets
    ctx.strokeStyle = lighting === 'night_ir' ? '#334155' : '#475569';
    ctx.lineWidth = 4;
    for (let x = 0; x < w; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, h * 0.35);
      ctx.lineTo(x, h * 0.7);
      ctx.stroke();
    }

    // Lawn / Grass
    ctx.fillStyle = lighting === 'night_ir' ? '#0a101d' : '#166534';
    ctx.fillRect(0, h * 0.7, w, h * 0.3);

    // Metal gate in center
    ctx.fillStyle = lighting === 'night_ir' ? '#475569' : '#1e293b';
    ctx.fillRect(w * 0.45, h * 0.35, w * 0.22, h * 0.35);

  } else if (scene === 'garage') {
    // Garage
    ctx.fillStyle = lighting === 'night_ir' ? '#1e293b' : '#e2e8f0';
    ctx.fillRect(0, 0, w, h * 0.65);
    ctx.fillStyle = lighting === 'night_ir' ? '#0f172a' : '#94a3b8';
    ctx.fillRect(0, h * 0.65, w, h * 0.35);

    // Garage door lines
    ctx.strokeStyle = lighting === 'night_ir' ? '#334155' : '#cbd5e1';
    ctx.lineWidth = 3;
    for (let y = 30; y < h * 0.65; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Overhead light
    ctx.fillStyle = lighting === 'night_ir' ? '#475569' : '#fef08a';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, 20, 50, 10, 0, 0, Math.PI * 2);
    ctx.fill();

  } else {
    // Hallway / Indoor
    ctx.fillStyle = lighting === 'night_ir' ? '#1e293b' : '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    // Perspective walls
    ctx.fillStyle = lighting === 'night_ir' ? '#0f172a' : '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w * 0.75, h * 0.35);
    ctx.lineTo(w * 0.25, h * 0.35);
    ctx.closePath();
    ctx.fill();

    // Perspective floor
    ctx.fillStyle = lighting === 'night_ir' ? '#09121d' : '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, h);
    ctx.lineTo(w * 0.75, h * 0.65);
    ctx.lineTo(w * 0.25, h * 0.65);
    ctx.closePath();
    ctx.fill();

    // Door at end
    ctx.fillStyle = lighting === 'night_ir' ? '#334155' : '#64748b';
    ctx.fillRect(w * 0.35, h * 0.35, w * 0.3, h * 0.3);
  }

  // 2. Render Dynamic Interactive Entities
  entities.forEach((ent) => {
    const px = ent.x * w;
    const py = ent.y * h;
    const s = ent.size || 1;

    ctx.save();
    ctx.translate(px, py);

    if (ent.type === 'courier') {
      // Courier with cap and delivery uniform
      // Head
      ctx.fillStyle = '#fbcfe8';
      ctx.beginPath();
      ctx.arc(0, -60 * s, 16 * s, 0, Math.PI * 2);
      ctx.fill();
      // Blue cap
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.arc(0, -64 * s, 17 * s, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-5 * s, -66 * s, 26 * s, 6 * s);
      // Torso / Jacket
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(-18 * s, -44 * s, 36 * s, 60 * s);
      // Legs
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-16 * s, 16 * s, 14 * s, 50 * s);
      ctx.fillRect(2 * s, 16 * s, 14 * s, 48 * s);
      // Cardboard box held in arms
      ctx.fillStyle = '#d97706';
      ctx.fillRect(10 * s, -30 * s, 26 * s, 24 * s);
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 2;
      ctx.strokeRect(10 * s, -30 * s, 26 * s, 24 * s);

    } else if (ent.type === 'intruder') {
      // Intruder wearing dark hoodie & mask
      // Dark hooded head
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(0, -60 * s, 18 * s, 0, Math.PI * 2);
      ctx.fill();
      // Mask
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-10 * s, -60 * s, 20 * s, 12 * s);
      // Hoodie body
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-20 * s, -42 * s, 40 * s, 64 * s);
      // Dark trousers
      ctx.fillStyle = '#020617';
      ctx.fillRect(-18 * s, 22 * s, 16 * s, 52 * s);
      ctx.fillRect(2 * s, 22 * s, 16 * s, 50 * s);
      // Flashlight beam
      ctx.save();
      const beamGrad = ctx.createRadialGradient(15 * s, -10 * s, 4, 60 * s, 40 * s, 90 * s);
      beamGrad.addColorStop(0, 'rgba(255, 255, 210, 0.6)');
      beamGrad.addColorStop(1, 'rgba(255, 255, 210, 0)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(15 * s, -10 * s);
      ctx.lineTo(90 * s, 20 * s);
      ctx.lineTo(70 * s, 80 * s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

    } else if (ent.type === 'pedestrian') {
      // Normal pedestrian
      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.arc(0, -60 * s, 16 * s, 0, Math.PI * 2);
      ctx.fill();
      // Red jacket
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-18 * s, -44 * s, 36 * s, 60 * s);
      // Jeans
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(-16 * s, 16 * s, 14 * s, 50 * s);
      ctx.fillRect(2 * s, 16 * s, 14 * s, 48 * s);

    } else if (ent.type === 'car') {
      // Vehicle Sedan / SUV
      const cw = 180 * s;
      const ch = 80 * s;
      // Body
      ctx.fillStyle = lighting === 'night_ir' ? '#475569' : '#b91c1c';
      ctx.beginPath();
      ctx.roundRect(-cw / 2, -ch * 0.2, cw, ch * 0.6, 12 * s);
      ctx.fill();
      // Cabin
      ctx.fillStyle = lighting === 'night_ir' ? '#334155' : '#991b1b';
      ctx.beginPath();
      ctx.roundRect(-cw * 0.3, -ch * 0.6, cw * 0.6, ch * 0.5, 14 * s);
      ctx.fill();
      // Windows
      ctx.fillStyle = lighting === 'night_ir' ? '#64748b' : '#38bdf8';
      ctx.fillRect(-cw * 0.25, -ch * 0.52, cw * 0.5, ch * 0.35);
      // Wheels
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-cw * 0.3, ch * 0.4, 18 * s, 0, Math.PI * 2);
      ctx.arc(cw * 0.3, ch * 0.4, 18 * s, 0, Math.PI * 2);
      ctx.fill();
      // Wheel rims
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(-cw * 0.3, ch * 0.4, 8 * s, 0, Math.PI * 2);
      ctx.arc(cw * 0.3, ch * 0.4, 8 * s, 0, Math.PI * 2);
      ctx.fill();
      // Headlights glow
      if (lighting === 'night_ir' || lighting === 'dusk') {
        ctx.fillStyle = 'rgba(254, 240, 138, 0.4)';
        ctx.beginPath();
        ctx.moveTo(cw / 2, 0);
        ctx.lineTo(cw / 2 + 80 * s, -20 * s);
        ctx.lineTo(cw / 2 + 80 * s, 30 * s);
        ctx.closePath();
        ctx.fill();
      }

    } else if (ent.type === 'dog') {
      // Golden/Yellow Dog
      // Body
      ctx.fillStyle = lighting === 'night_ir' ? '#64748b' : '#d97706';
      ctx.beginPath();
      ctx.ellipse(0, 0, 32 * s, 18 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      // Head
      ctx.beginPath();
      ctx.arc(-30 * s, -12 * s, 15 * s, 0, Math.PI * 2);
      ctx.fill();
      // Snout
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-45 * s, -14 * s, 15 * s, 10 * s);
      // Ears
      ctx.beginPath();
      ctx.moveTo(-30 * s, -26 * s);
      ctx.lineTo(-22 * s, -10 * s);
      ctx.lineTo(-38 * s, -10 * s);
      ctx.fill();
      // Legs with slight walk animation
      const legOffset = Math.sin(tick * 0.15) * 6 * s;
      ctx.fillStyle = lighting === 'night_ir' ? '#475569' : '#b45309';
      ctx.fillRect(-18 * s, 12 * s, 8 * s, 26 * s + legOffset);
      ctx.fillRect(-4 * s, 12 * s, 8 * s, 26 * s - legOffset);
      ctx.fillRect(10 * s, 12 * s, 8 * s, 26 * s - legOffset);
      ctx.fillRect(22 * s, 12 * s, 8 * s, 26 * s + legOffset);
      // Tail
      ctx.strokeStyle = lighting === 'night_ir' ? '#64748b' : '#d97706';
      ctx.lineWidth = 5 * s;
      ctx.beginPath();
      ctx.moveTo(30 * s, -5 * s);
      ctx.quadraticCurveTo(45 * s, -20 * s + Math.sin(tick * 0.2) * 5, 42 * s, -30 * s);
      ctx.stroke();

    } else if (ent.type === 'cat') {
      // Cat
      ctx.fillStyle = lighting === 'night_ir' ? '#64748b' : '#1e293b';
      ctx.beginPath();
      ctx.ellipse(0, 0, 22 * s, 14 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      // Head
      ctx.beginPath();
      ctx.arc(-20 * s, -8 * s, 12 * s, 0, Math.PI * 2);
      ctx.fill();
      // Pointed ears
      ctx.beginPath();
      ctx.moveTo(-22 * s, -18 * s);
      ctx.lineTo(-17 * s, -8 * s);
      ctx.lineTo(-27 * s, -8 * s);
      ctx.fill();
      // Tail curled
      ctx.strokeStyle = lighting === 'night_ir' ? '#64748b' : '#1e293b';
      ctx.lineWidth = 3.5 * s;
      ctx.beginPath();
      ctx.moveTo(20 * s, -2 * s);
      ctx.quadraticCurveTo(34 * s, -15 * s, 28 * s, -24 * s);
      ctx.stroke();

    } else if (ent.type === 'package') {
      // Amazon/Postal delivery package box
      const bw = 40 * s;
      const bh = 32 * s;
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 2;
      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
      // Packing tape
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(-bw * 0.15, -bh / 2, bw * 0.3, bh);
      // Shipping label barcode
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-bw * 0.35, -bh * 0.25, bw * 0.35, bh * 0.4);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-bw * 0.3, -bh * 0.15, bw * 0.25, bh * 0.2);

    } else if (ent.type === 'open_gate') {
      // Open Gate Anomaly
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 4 * s;
      ctx.strokeRect(-30 * s, -40 * s, 60 * s, 80 * s);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
      ctx.fillRect(-30 * s, -40 * s, 60 * s, 80 * s);
    }

    ctx.restore();
  });

  // 3. Environmental Overlays & Filters
  // Lighting Filter
  if (lighting === 'night_ir') {
    // Infrared Monochrome tint + IR Grain
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(0, 0, w, h);
    // Greenish-gray IR filter
    ctx.fillStyle = 'rgba(16, 185, 129, 0.05)';
    ctx.fillRect(0, 0, w, h);
  } else if (lighting === 'dusk') {
    // Dusk golden-orange warm overlay
    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.fillRect(0, 0, w, h);
  }

  // Weather: Rain simulation
  if (weather === 'rain') {
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.4)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 45; i++) {
      const rx = (i * 27 + (tick * 12)) % w;
      const ry = (i * 43 + (tick * 24)) % h;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 8, ry + 18);
      ctx.stroke();
    }
  }

  // Restore zoom/pan transformation
  ctx.restore();

  // 4. CCTV Camera Artifacts & OSD
  // Scanlines
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 1);
  }

  // Camera OSD Info
  ctx.fillStyle = '#ffffff';
  ctx.font = '10px monospace';
  ctx.fillText(`CAM-SIM // BITRATE: 2840 KBPS // H.264 // 30.0 FPS`, 14, h - 14);
}
