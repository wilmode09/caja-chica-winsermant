/*
╔══════════════════════════════════════════════════════════════════╗
║           CIERRE DE CAJA CHICA — 100% GOOGLE, COSTO $0          ║
║                                                                  ║
║  Tecnologías:                                                    ║
║  • Google Vision AI  → leer imágenes (1 000 gratis/mes)         ║
║  • Google Apps Script → backend + escribe en Sheets             ║
║  • Google Sheets      → base de datos visible para admin        ║
║  • Google Fonts       → tipografía                              ║
║                                                                  ║
║  INSTRUCCIONES DE CONFIGURACIÓN (lee antes de usar):            ║
║  ─────────────────────────────────────────────────────          ║
║  1. Crea un proyecto en console.cloud.google.com                ║
║  2. Activa "Cloud Vision API"                                   ║
║  3. Crea una API Key (APIs & Services → Credentials)            ║
║  4. Pégala en VISION_API_KEY abajo                              ║
║                                                                  ║
║  5. Abre script.google.com → nuevo proyecto                     ║
║  6. Copia el bloque APPS SCRIPT al final de este archivo        ║
║  7. Reemplaza SPREADSHEET_ID en el script                       ║
║  8. Implementar → Web App → Anyone → copia la URL               ║
║  9. Pégala en APPS_SCRIPT_URL abajo                             ║
╚══════════════════════════════════════════════════════════════════╝
*/

import { useState, useRef, useCallback } from "react";

// ══════════════════════════════════════════
//  🔑  CONFIGURACIÓN  ←  edita esto
// ══════════════════════════════════════════
const VISION_API_KEY   = "AIzaSyBM1GIX7BG1xq3sJvREfPGqACVJKcQUnqo";
const APPS_SCRIPT_URL  = "https://script.google.com/macros/s/AKfycbz_Cdi5YD5rSRpgJw1HsnixpMOM8bYMVlvC8wUoP-DA9-CZ9nX1UcO6WywwTcE1Hs4N/exec";
// ══════════════════════════════════════════

// ─── Paleta ───────────────────────────────
const C = {
  bg:       "#f5f3ee",
  surface:  "#ffffff",
  card:     "#fafaf8",
  border:   "#e8e4db",
  ink:      "#1a1a18",
  muted:    "#8a8680",
  accent:   "#1a6b3c",
  accentLt: "#e8f4ed",
  warn:     "#b45309",
  warnLt:   "#fef3c7",
  danger:   "#dc2626",
  dangerLt: "#fee2e2",
  stamp:    "#2563eb",
};


// ─── Helpers ──────────────────────────────
const fmt = (n) =>
  Number(n || 0).toLocaleString("es-CR", { style: "currency", currency: "CRC", minimumFractionDigits: 0 });

const today = () => new Date().toISOString().slice(0, 10);

const CATS = ["Alimentación","Transporte","Materiales","Servicios","Oficina","Otro"];

const CAT_COLOR = {
  Alimentación: "#ea580c", Transporte: "#0891b2", Materiales: "#7c3aed",
  Servicios: "#2563eb", Oficina: "#d97706", Otro: C.muted,
};

// ─── Google Vision OCR ────────────────────
async function runVisionOCR(base64Image) {
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Image },
          features: [
            { type: "TEXT_DETECTION",     maxResults: 1 },
            { type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 },
          ],
        }],
      }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.responses?.[0]?.fullTextAnnotation?.text || "";
}

// ─── Parser de texto OCR → campos ─────────
function parseInvoiceText(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Monto: busca el número más grande con símbolo monetario
  const montoMatches = [...text.matchAll(/(?:₡|CRC|¢|colones?)?\s*(\d[\d\s,.]+\d)/gi)];
  let monto = 0;
  montoMatches.forEach((m) => {
    const n = parseFloat(m[1].replace(/[\s,]/g, "").replace(/\.(?=\d{3})/g, ""));
    if (!isNaN(n) && n > monto) monto = n;
  });

  // Fecha
  const fechaRx = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
  const fechaM  = text.match(fechaRx);
  let fecha = today();
  if (fechaM) {
    const [, d, m, y] = fechaM;
    const yr = y.length === 2 ? "20" + y : y;
    fecha = `${yr}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }

  // N° factura
  const facturaRx = /(?:factura|ticket|recibo|N[°º]?|#)\s*:?\s*([A-Z0-9\-]{3,20})/i;
  const facturaM  = text.match(facturaRx);
  const numero_factura = facturaM ? facturaM[1] : "";

  // Proveedor: primera línea que parece nombre de comercio
  const ignorar = /^(fecha|date|total|subtotal|iva|impuesto|gracias|factura|ticket|recibo|tel|fax|www|http)/i;
  const proveedor = lines.find((l) => l.length > 3 && l.length < 60 && !ignorar.test(l)) || "";

  // Descripción: segunda línea candidata
  const descripcion = lines.filter((l) => !ignorar.test(l) && l !== proveedor)[0] || "Compra";

  // Categoría por palabras clave
  const textLow = text.toLowerCase();
  let categoria = "Otro";
  if (/restaurante|sodas?|comida|almuerzo|desayuno|cena|café|super|mercado|pizza|pollo/.test(textLow)) categoria = "Alimentación";
  else if (/taxi|uber|bus|gasolina|combustible|peaje|estacion/.test(textLow)) categoria = "Transporte";
  else if (/ferretería|material|tornillo|cemento|pintura|madera/.test(textLow)) categoria = "Materiales";
  else if (/electricidad|agua|internet|teléfono|servicio/.test(textLow)) categoria = "Servicios";
  else if (/papelería|tinta|impresión|sobre|folder|oficina/.test(textLow)) categoria = "Oficina";

  return { fecha, proveedor, descripcion, monto, numero_factura, categoria };
}

// ─── Enviar al Apps Script → Sheets ───────
async function sendToSheet(employee, invoices) {
  const body = JSON.stringify({ employee, invoices, timestamp: new Date().toISOString() });
  const res  = await fetch(APPS_SCRIPT_URL, { method: "POST", body });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Util ─────────────────────────────────
const toBase64 = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

// ══════════════════════════════════════════
//  UI COMPONENTS
// ══════════════════════════════════════════

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Sans+3:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:${C.bg};font-family:'Source Sans 3',sans-serif}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  input::placeholder{color:${C.border}}
  input:focus,select:focus{outline:none;border-color:${C.accent}!important;box-shadow:0 0 0 3px ${C.accentLt}}
  ::-webkit-scrollbar{width:4px}
  ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}
  select option{background:#fff}
`;

function Pill({ label, color }) {
  return (
    <span style={{
      background: color + "18", color, border: `1px solid ${color}33`,
      borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700,
      letterSpacing: 0.4, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function Btn({ children, onClick, variant = "primary", disabled, full, sm }) {
  const styles = {
    primary: { bg: C.accent,   fg: "#fff",     border: C.accent  },
    ghost:   { bg: "transparent", fg: C.ink,   border: C.border  },
    danger:  { bg: C.dangerLt, fg: C.danger,   border: "#fca5a5" },
    warn:    { bg: C.warnLt,   fg: C.warn,     border: "#fcd34d" },
  };
  const s = styles[variant];
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        justifyContent: "center",
        padding: sm ? "7px 14px" : "11px 22px",
        fontSize: sm ? 13 : 15, fontWeight: 700, fontFamily: "inherit",
        background: s.bg, color: s.fg,
        border: `1.5px solid ${s.border}`,
        borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        width: full ? "100%" : "auto",
        transition: "all 0.15s",
        letterSpacing: 0.2,
      }}
    >{children}</button>
  );
}

function Loader({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.accent, fontWeight: 600 }}>
      <span style={{
        width: 18, height: 18, border: `2px solid ${C.border}`,
        borderTop: `2px solid ${C.accent}`, borderRadius: "50%",
        animation: "spin 0.8s linear infinite", display: "inline-block", flexShrink: 0,
      }} />
      {label}
    </div>
  );
}

const Lbl = ({ children }) => (
  <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
    textTransform: "uppercase", marginBottom: 5 }}>{children}</div>
);

const Inp = ({ value, onChange, placeholder, type = "text" }) => (
  <input value={value} onChange={onChange} placeholder={placeholder} type={type}
    style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 9,
      padding: "10px 13px", fontSize: 15, fontFamily: "inherit",
      background: C.surface, color: C.ink, marginBottom: 2 }} />
);

// ══════════════════════════════════════════
//  SCREEN 1 — Identificación
// ══════════════════════════════════════════
function EmployeeScreen({ onContinue }) {
  const [name, setName] = useState("");
  const [dept, setDept] = useState("");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
      background: `linear-gradient(160deg, ${C.bg} 60%, ${C.accentLt})` }}>

      {/* Logo Winsermant */}
      <div style={{ textAlign: "center", marginBottom: 36, animation: "fadeUp 0.5s ease" }}>
        <div style={{ width: 140, margin: "0 auto 16px",
          background: "#fff", borderRadius: 20, padding: "12px 16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.10)", border: `1.5px solid ${C.border}` }}>
          <img
            src={"data:image/jpeg;base64,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OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+IDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiIHhtbG5zOklwdGM0eG1wRXh0PSJodHRwOi8vaXB0Yy5vcmcvc3RkL0lwdGM0eG1wRXh0LzIwMDgtMDItMjkvIiB4bWxuczpwaG90b3Nob3A9Imh0dHA6Ly9ucy5hZG9iZS5jb20vcGhvdG9zaG9wLzEuMC8iIElwdGM0eG1wRXh0OkRpZ2l0YWxTb3VyY2VGaWxlVHlwZT0iaHR0cDovL2N2LmlwdGMub3JnL25ld3Njb2Rlcy9kaWdpdGFsc291cmNldHlwZS90cmFpbmVkQWxnb3JpdGhtaWNNZWRpYSIgSXB0YzR4bXBFeHQ6RGlnaXRhbFNvdXJjZVR5cGU9Imh0dHA6Ly9jdi5pcHRjLm9yZy9uZXdzY29kZXMvZGlnaXRhbHNvdXJjZXR5cGUvdHJhaW5lZEFsZ29yaXRobWljTWVkaWEiIHBob3Rvc2hvcDpDcmVkaXQ9Ik1hZGUgd2l0aCBHb29nbGUgQUkiLz4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8P3hwYWNrZXQgZW5kPSJ3Ij8+AP/hAvBodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvADx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IlhNUCBDb3JlIDYuMC4wIj4KICAgPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICAgICAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgICAgICAgICAgeG1sbnM6SXB0YzR4bXBFeHQ9Imh0dHA6Ly9pcHRjLm9yZy9zdGQvSXB0YzR4bXBFeHQvMjAwOC0wMi0yOS8iCiAgICAgICAgICAgIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyI+CiAgICAgICAgIDxJcHRjNHhtcEV4dDpEaWdpdGFsU291cmNlRmlsZVR5cGU+aHR0cDovL2N2LmlwdGMub3JnL25ld3Njb2Rlcy9kaWdpdGFsc291cmNldHlwZS90cmFpbmVkQWxnb3JpdGhtaWNNZWRpYTwvSXB0YzR4bXBFeHQ6RGlnaXRhbFNvdXJjZUZpbGVUeXBlPgogICAgICAgICA8SXB0YzR4bXBFeHQ6RGlnaXRhbFNvdXJjZVR5cGU+aHR0cDovL2N2LmlwdGMub3JnL25ld3Njb2Rlcy9kaWdpdGFsc291cmNldHlwZS90cmFpbmVkQWxnb3JpdGhtaWNNZWRpYTwvSXB0YzR4bXBFeHQ6RGlnaXRhbFNvdXJjZVR5cGU+CiAgICAgICAgIDxwaG90b3Nob3A6Q3JlZGl0Pk1hZGUgd2l0aCBHb29nbGUgQUk8L3Bob3Rvc2hvcDpDcmVkaXQ+CiAgICAgIDwvcmRmOkRlc2NyaXB0aW9uPgogICA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgr/7QBgUGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAACccAVoAAxslRxwCAAACAAIcAm4AE01hZGUgd2l0aCBHb29nbGUgQUkAOEJJTQQlAAAAAAAQJk996Q1Ch0NnfHYYzlaEXf/tAGBQaG90b3Nob3AgMy4wADhCSU0EBAAAAAAAJxwBWgADGyVHHAIAAAIAAhwCbgATTWFkZSB3aXRoIEdvb2dsZSBBSQA4QklNBCUAAAAAABAmT33pDUKHQ2d8dhjOVoRd/8AAEQgEQAPAAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAPP/aAAwDAQACEQMRAD8A/fnvR0oPWkoAXJopKKAFpO9FFABRS/SkoAKWkooAWjJopKACgetFFABRRS0AJRRRQAUUUUAH0o5oooAKKKKACiiigApRSUUALSUUZoAKKKKACiiigAooooAKKKKACjNFFABRRRQAUUUtACUtFJQAtJRRQAUtJRQAUtJRigA70UUUAFFFFABRRRQAUUUtACUtFJQAfjRRRQAUtJRQAUUUUAFFFFABRRRQAUUUUAFFFFAC5pOaKKACj3FFFAC0lFFABRRRQAUUUtACUUUUAFH1oooAKKKKACiiigAooooAKKKKACiiigAoOaKUUAJRRRQAtJRRQAUUUUAH0pevek60tABRRRQAopKKSgBaPxpKUc0AFJS0hoAWkoopgf/Q/fj60UUUAFHtRil4oASl6cUUdDQAlFFFABRRRQAUUUdKACiiigApaSigBaSlpKACilpKACijpRQAc0UUvJoAKSiigBaSiigAoooBoAKKM0UAFFFFAC8UUlFABRRRQAUtJRQAUdaKWgBKMUUooASilJpKACjrRRQAUUUUAFFFFABRRRQAUUUUAFHSiigApf0pKKAClpKO/NABRR3ooADRRRmgAooooAKKKKACiiigAooooAKKWkPtQAUUUUAFFFGaACiijNABRRRQAUYoooAKKKKACiiigAo7UtB5oASlopKACiiigAooooAKKKKACilpKADFKKSigAooooAKOaXFGO9ACUUd6X60AFJS5NHWgBKKOaKAFozSUUAHvS0lLQACkoooA//R/fnvxSA8UYNL2zTAWm0UopAJS0dKSgAooooAKKKSgBaKKKACiiigAopeKKAEooooAPeikxR9KAFopKWgYUUtJQIKKKKACikNLigBKWiigAooooAKKKKACijFFABSCiloAKKKKACiiigAooooAKKSloAKKTFLQAUUUUAFGaKSgBaOKKSgBaKKKACiijNABRRSUALRSfWigBaKKTigBaKKOlABRRRQAUUUUAFHWkpaACikpaACilpKACiikoAWikNLigAopKWgAozRRQAUUUc0AFFFJQAtFFJQMXNHHWiigQUUUUAFHFFFABRSUtACUtFFABRRmigAowMUUUALx2PNB6ZpKO9MApe9JwaKQBSikpaAD8KKSlzxQAlFApR1oASilxSdKACl96CaXtQA2ilPFJQB/9L9+O9OPSm+9LQAZ4pKUUlABRRRQAUUUUAFJS80c0AFFFFABRRRQAUUlLQAlLSc0ZNABS0nNLQAmBS0UUAL7UlFFACZopaOaACiiigBKWijFABRRRQAnNFLSc0AFFHNLk0AFFFFABRS0lACUpoo5oASjFHNHNABS0c0UAFFFFABRRRQAlLRRz3oAKKTml570AFFFLQAlFFFABzRRzSUAFFHNLzQAdaXHNJjvS0AHSkpaTFABRRRQAnWlpOe9HNAwpaOaMUCCiiigBaSiigApKOaXmgBKKXmigAooooAKKKKACikooAKKMmloAKKKKACiijpQAUUUUAJRRzS0AJ0paKKACiiigAoo96KACkNAzS0AFFJzTsetACUUUUAL9KSjpRQAUUZooAXvR+lJQOtADug5pKdxSE0ANpaTvRQAtJg0d6WgD//0/3570Gig0AFJS0UAJRRQBQAUnSl+tFABRRilwaAEopfeigBKKKKACij9KOKACiiigA4opcGjBoAKSl5oNACUUUcUAFFFFABRRg0uD1oASl+lGCaKAEpetJRQAUZopOtAC0UYpcGgAoxRz+NAzQAlFL0pKACjNFHFABRRRg0AGKMUtGDQAUlLSUAFFHFFABRRiigApaNpowTQAUUUGgBKKKKACiiigA60UtGDQAlLRg0dKAEozRRQAdqKKKACiil5oAM0nWlwaSgBaKKSgApeM0lJQA7PrScUUUAFFLg0UAFJS4pMUAFLmkooAPej2pcUmKADml70Ac0uKAExRijFH0oAMUn1pc0nFABS96SnYoATHejB60Yo5xQAlLg0YNLg0ANNGKXBFJQAGjpRRQAUtJijmgBcUfSjBo56UAFFGKSgAooo70AFJS0Y7UAFHvSjNFACjmij60nagA70lO9abQAUUUUAf/U/fk0lLSUAFFFFABiiiimAUUUUgD6UtJS55oASilzRmgApKO9FAC+1JRRQAUtFGaAA0c0ZooATmiiigAooooAKWiigAzRRmjNABRSUUAFFFFABRRS0AFFGe2aM0AFFHFGaAEooooAKKKKACloozQAUc0maKACiiigAooooAKWk4pc0AFFGRRQAc0lGaKACiigUAGKWjFLxQAnWiijNABSUtGKAEooIooAKKKKAFooozQAUUZooASiiigAoo96KAClzSUtAB9KKM+tGaAEpaKSgAooooAd9KSgUUAAzS9s0maM0AL7ZpM0Z4pKAD3paSigBcmikooAXNGaM0ZoAOaM0GkoAXNJRRQAUUUtACUuaKKAD60UUZoAKDSc96KAFxRiij2oABxRRR0oAPaiiigA7UdqM0lAC0d6SlzTASilpKQH/9X9+e9JR1ozQAUUUUAH1ooooAKWikoAOKM0UUAFGaKKAEpaSloAKXikpaADNLx6UlJQAvFFJSUALRSUooABxS0lLQAUvHpSUlAC59qTj0o96SgBc0lFFAC0UCigBaOKMUUAHFHHpSUUAGRRSUUAFLSUtAC0tNooAWjiikoAXIpKKSnYApaTpS0gClpKWgA4peKbS96ADikopKAFpKPpQKAFo6UUUAOz2pM+1FFABmk/CikoAWjP4UlFAC5NFFFABS0dqSgBeMUZ9qSigBeKSkpaACik70tABS0fWigA/CiikoAXikopKAFzSUtFABS0c0UAFHHpRSGgBeKM0lFABRRSGgBaKKKAClooxQAcUcelJSUALRRSUALRSd6WgA+tLRRQAcUZpKKAF4pKOvFHOaAEpaKKAF5opKX60ALScelFJ7UALSUUUAFFKMd6SgAooooAKWkpaAP/1v34ooxSUALRRRQAUUUUAFL70lFABSZ9qWigYmRRmlpKBC0UlLQAUUUUAFJS0lMA4o49KKKQxeKBSUtAgpaSigAozQaKAEzRmijNAwoopaACj6UUUCFpKKKACkzS0lABmijg0UAFLRRQAUc0UUAHSkzS0nFMAoyKKMikMOKWkpaBBRRRQAUlFFABRkUUUDDIoopaACiiigQUUUlABmkBHpS8Ue1ABx6UUUZoGLRRRQIKKKKAEoz7Ue9FAwz3oyKKKAFopKWgQUUdqTNAC0UlFABn2ozRRQMKWiigQuaSiloASjNFIaADNGaKDQMKWkooELRR2ooAKSlooATPtQOtFHFABn2oo9qKBi0UCigQUUUUAFIDRmigYvFFJxS54oATOaXNFFAgoo6UUAFL0pv6UtACHilpM0vWgdgpKX2ooELSUUUAL3pKKWgD/9f9+KKKKACiiigAooooAKKKMUAGKTFGB1oxQAYpaKKACj6UtFACUUGkxQAtJijFGKADFFLRQMOOlFLRQISiik+tABS4pMd6KACjFGKMd6AClopaAEopaSgAo5pMUYoAUDNFJijFABS0YooAOKKXjFJQAUUh5ooAWjFJRgGgBaKTHaloGFFLR0oEJRQaTFABS4pMCjFAC4pKXFFABRxS0lABmilpKADFJiijFAwxRijFGKBC0UUtACUUtJQAUc0UmKADFLikxRgUDDFFLiigQUUUUAFGKSjFABRiijFAwxRRgUuKBBRS0UAJRRSUALSYoAoxQAuO1JijAoxQMKWiloEJRS0lABSUUYpgGKMetJilwKQw9qKUUUCCilpKACk5paTHNAC9qMUmKMZoAMYpcUmPSloAB6Ue1LRQAlFFJQAUtJ2oxQAuKKSlFAwoNFLQIKSig0AJS0UUAf/Q/fiiiloASiijFABRRRQAUUlLQAUUtGKAEpaKMetABSZpeKTpQAUUc0UAJS0Uv40AJS0UY5oASilxRQAlJSmjPFACdaKWlAoASilwPWjigA4ooooASiiigBKKWigA60uO1GKMCgAooxRx60AJRS0lACUtFFABRigUuBQAUUYoxmgAoJo4pKACik60v0oASil96XigBAM0tGB60UAFJSnHrRQAlFFFACUtFFABjmlo4o4oAKKMDtRQAlFFFACdaKWigBKWjFLgUAApKWjFACUUtJQAlLRRzQAlLRS/jQAYoowPWigApKXHNJQAUlLR+FABRRSigBKXFGPelwPWgBKSl/Gg0AJRRRQAlFLRQACilxRxQAlLRxRxQAUlKaSgAo460UUAJS4pcA0cUAGKMUcetLQAlJS4pKADrSe1LQKAE6UtFHFABS0YHrR+NABRRgetGKAEooo7UAFFFFAH/9H9+PaijNFABRRRQAUUUUAFFFLzQAfhRzRRQAUUUlAC0lH40UAFFFLQAUc0fQUfhQAGg8Uc0lACmkoooAKKKKACl+lGCKPwoAOaMUlFADulNpaSgAooooAKWj8KOfSgA5oo59KPwoACKOlGaQ0AFFFFABRRS0AFABoo59KADmiik5oAXpSUUUAFGKKKACl5xRR+FAC80n1pPwooAWkoooAKKMZpcd6ACkpeaKACjFA+lFABzRxmkooAKSlooAKWij8KADFFJz6Uv4UAFFFJQAtJRRQAUUUtACUtH4Uc0AFFJzRQAtJRRxQAUUUUALR9KKB9KADFGDRz0ozxQAlKaSigAooooAKWkxRQAtGDR+FH4UAFHSjPrSUAFFFFABRRS80AAFLzSfhR+FAC47UlFJQAtJRRQAUYopaAEpaSjnFAC0UntS0AFFH1pKACjtRRQAUUUUAf/9L9+KKKKACiiigAooooAWjNFFABmjNJSUALRSUUAFLSUtAC0ZpKWgAzRmjikzQAZNHWikNMAoAoopAL7CiiloAMmjOKKQ8UALmkzSUUALRSUdaYC0UdKKQC0Z70UUAGTRk0lJQAvNFJRTAKWkFLSAWjNGaSgBc0ZNFJmgAye9FJRTAMUUc0vakAClpKWgAoJNFFABmkzRSU7AFLSUtIBRRRS470AA4oJoooABSc07IppNMBKKKKACiiikAUufWiigAzRmkooAOtFJS0wExS0lLSAWjNFFABnvRmikoAXJpOaT3o60DQUUUtABS0e1FAgzRk0lFAC5NJmg0hoAWkoooHYWiiloEHSiijtQAZNGTSUUAFFJRTAKXFJS0gFozRRQAdqMmikzQAtJSc0c0wClpPpQKQC0tJS0AFJmijpxQAZNFHOaTvQAUvWkoFAC0UUUAFFFFAH//T/fiiiigAooooAKKKKADiiik60ALSc0UZpgHPaiiikMX60UUUCCiiigAzRSUe9MYvNIM0UUgAZpaTmloEFFFFABRzRSUAHNBzR+FHSgYnNL9aM5petABijiiigQUUUlABzRmijtzTGAzRzRmlpAJzS0UUCF4pKKSgBaTmij8KBhzSc0v4UUAAzS0UUAFFFFAgpO9LSUwF5pO9FFAw5p3JpB1paQBRS0uKBDcUe3pS+4ozQAhzSckUvSlpgN570vNKM0UWAMetJwKWigBKT3p1J9KAEpMmn5pposMTnNLzS0UANpaKKQgo+lFFACUc0tJTGgyaOaKKQBzSj3pKWgQUUUUAFJn0oooAMmjJoo/CgaDmj60UUALRxRRQIWkopKADmjJoooHYOc0c5pBS0ALQKKKBBRxRRQAUlBx1oyKBhzRlsUUe1AMPrS0lLQIWjtSUfWgApDS0nNABzRyDRmigA5pe+KTvS0DCiij8aBBRRRQB/9T9+KKKKACiiigAooooAOKTiiloATijilpMUALxmiiigAoopaAEpKWkoAOKOKPaigYZHailooAKXHNFFAgpKKKAEoyKKWgYnFHFFLQAlLRS0CEwaKKKACk4paKAEBFHFLRQMKKKKBBiilpKACkyKKKADijiijigYcUtFFAgoopaAEpMilooATIoyKPpS0DE4opRS4oEA6Up96SloATnvR0pcUY70AJRxTv0pKAEowKdRQAlApetHSgBKKWlp3AbSUtHWgBOKDilHpRQAnHSl60DHaloAaRRS5ptIApMilo4oATijIoxRQMBiloooEFHNLRQAlFFJQAZFGRRijFABkUUtFAwo5oo9qBBzRRRigBKOKWigBMijIpcUUDEpcUUvGKBBSUtJQAlFLikx2oAMj1o4pcUfSgYmRS9aKKBBRzS0lABSUuKMCgAyKTilpKADijIoxS0DCiil4xQISiijmgAooooA//V/fiiiigAoFFFABRRRQAUlL1ooASlpaOKACij8KOKADNJRR1oAKTFLRQAlLS0celACUtLSfhQAZoo4pKADmkpaSgAxzR0paKADiloGPSj8KACijNHFACUUUUAJQKWl6UANpeKWjtQAUdqWk9sUAHakpaSgApKWigBMUtLRQAnSlpfwpPwoAKQ0veigBDSUtFACYpaKWgAAp3ApBiuN8f+MLXwP4XvNfuMO8S7YUJxvlbhV/PrXPjMXToUpVqrtGKu35IipUUYuUtkdiTilr88m/aK+JLElpbcfSM//FVWf9pD4lx8CW3/AO/R/wDiq/L/APiMmUXt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n4UYNHPrQAh60Uc0nSgB2eaQUlJmgBTmiil+lABRRjFGPegA4paTB9aKACkoooAKKKKAD6UtFGKADtRxR+NGPegANBpKKACijPtRQAUUuDRigA4o4FHPrRg0AAoowaSgBaTiijNABR3zS/pRj3oAKO2aPxpcGgA4pOKMH1ooAKSg0UAFFFLQAn1paMUe+aADilxSc+tHPrQAdKKSj2oAKPakpaAFooox70AHHajijFHPrQAcUnSlpDQAUUn4UvFABS0UCgAI5zS8UmCTRg+tABxijijB9aT60ALSUUZoAKKKWgAxRRRzQACjgUAGjkd6ACikooATvS0UUALRRR+NABS4FJjnrRigAoopKAFyTRnmm0vFADuvvRSCl60AL0pOKD9aMUAApKXHvTaAFzQKbS0AL70uc03tS0AL6UUmKO9AC8YpKCD60lAC0me1FJQAvWiiigAoooHWgD//0f35PWikPeigA4paSigApaTFFAC0UmaKACiiigAPXNGfSikoAKWiigAo70tFACUUUUAFJS0UAJRRS0AFLSUcYoAKKXNJQAUUUnNMBaKMUmMigBaKKKQC0UUlABRRSc0ALSUUUwFooopAFLR05o70AFJRRQAZpKOaKACl70lLQAUtJRQAtJzS5pKACik70UwDNFLRSAKUZpKKAFpKWkoAKKKOaAEzRRiigApR70g6UtABS80UUAJRRRzQAZpKKWgBKWjFFAB0paKM0AFJS0lABR7UUlMAoooFAC0oo4pKQC0hpaSgAoopMGmAtJS4pKQxaKBRQIWijOaKAEooo5oAKSilxQOwn0paBRQIPpS+1FGc0AFJS5pKACjiikoHYM0tJS0CClpO9GaAF5pKAaKAF6mko5pOtABS0c0UAFFHeigAooooA//S/fg0e1B60UwCiiikAUUUdqACiiigBKKKKAExS0Uc0DClpOaWgQd6M0UlAC0nWjmigYYxRjijmigQUtFFAC0lFFAB3pMUuaQ0AJilwKTPvS0DACjAoNLQIKWkooAKSlpKACkxS596PxpjDFJil9qKQBS0gFLxQIKDRSUAHaj2o5o/GmAYxRiiikMMcUtJTqBBSUUUAFJj0pabz3oAMZoxzS80UDAilpKUCgQUUUdqACikNFACYoxS80UDDFJil5ooAUUtJRQIM0ZopKACjvRzRTGGKKQfWl5pAFLRRQIKKKKA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A0uaBBSUtJQAUUmKMUDQUUYxRigB2RjmjikooEL0pKWkoAKKTBoINABR0owetGKAFHNL3xSUUAFFFFABRRRQB//Q/fg/WiiigAooooAWkNL3ooASkpaSgA/GlGfWiigAoopaACkpetJQAUnNBo9qAD3zRg+tFLQMMUCjGelLQIKKKKAEpKWkoAO9HWlooATn1opaKAClHWjFHFABxSUUUAJzRS0UwG/jS4PrS9aKQBjFFLRQAe9HFJRQAUn40tJQAUc+tLRTATn1paWikAfhRRSUAFJS0UAJRz3opeaYCY96WiikAUtGKKAENJS0UAJzRzRS96AEwaXmjmloASiilFACUUtJQAlHPrRRzQADPrRg+tFLQMMUUuKOKBBSUtJQAUnNLRQAmKOaOaWgYmCaXHFFLQISilxRQAlFGaKAG0v40ZpaAG/jS496WloASiil6UAJRRRQAhooooAOfWjn1peaKACil+tFABSUtHGKAEpOaXNH0oAACT1oxS4o6UDG/jS4paMUCAdaDR/KkoAKSlpKADmjn1opelACc0UtLQAlLRijtQAlFHeigAopaSgD/9H9+KWkooAKKKKAFpKKKACiiigBcUYoooAMGjBpKWgBKKKKACiiigApcUUUAGPejFBowaAF/GkopKADpRSUtAB9KKKXBoAMUYPSij60ALg0n40lFAC0lFFABRRS0AFGKOaKAD8aMUUlABRRRQAUlLS4xQAlLj3oFLQAmD60Ae9AooAMUlFFABSe1LRQAUUtFABg0YOKKO1ABij60lFABRRRQADFFFKKACj8aMGj8KAClpKPwoADSUvWkNACUuKKWgBKX8aKKAFwfWkx70UYoASiiigAooooAKXFFFABg+tGD60vPSkoAPajpSUUABpM0tFABRS0UAFLg0nNHNABiiij9KAEozRRQAUUUtABRg+tHelxQAmD60YpaSgApM0uKTigBR60UdRRQAuMCkx70tJzQAv40Y96QfSigAxSUtJQAUUdqKACloooAMe9FFHagAoo9qOOlABSUUUAFFLSUAf/0v34oo+lKKAEooooAMGiiigAopaM0AJml3UZozQAmeKKM5pKAF+tFJS0AFFGaXOKAEopc0ZNACZpetGaSgAoopKAFoopaACgHFGaXPrQAmaTOaXNGaAEo7UUlAC0UmKWgAo96XNLnmgBOKM0Z9KM0AJmijNJTAXnFFJS0gAUuaOKWgBOKMijNGaAAGijNJQAUUnWjFAC0tJS0AFFFGaACg0Z7UE8UAJRRSUALQKMUtACZ4paAaM0AGaM0ZoyaADNAPekzR1FAC5pKQUtABS5FFLmgBMjpRmjNGaADNJRmigAopKXFABRRS5oASjNLmjNABnNGaM0lABRSe9FAC0UlOFABRkYpQeaTNABmjIozxSZoAKM0UmKAFoo6UUAFLRS5NABQT6UmaCaAEzR2ozQOtAC8YpKUgAcUlABS0e9HXigAzRS5xRmgBBRmjJpOtABRSYooAWiiloAM8UmRS0ZoATNFLmkzQAtJ1oo4oAKKO9FAC0lL1pM0Af/0/34ooopgFFFApAFFFLigAopKKAFptL+FJQAcUUZNH4UAFLRRQAUUUUAFGaKSgBaSlpvPpQAuaKMn0ooAdRSUYoAXikooNABSUZNGaACj60c+lFAC0UUUALxSUfjRQAUUmaM96ADrR0o59KPwoAWiiigApaKSgAoopM0AGcUUnPpS0AFLSZ9aWgAFLSUUALSGiigApKOfSkyaAF7UUZ9qWgAooooAWikpCcUALmjNJzRk+lMApc0mT6UvbNIBBzTu9JRQAtFH40lABxR9KKTJoAU0maM+1FMApaSlpDF70lLSUCF4pKKT8KAFpPpRn2o/CmAUCjn0opALS0nej3oAWkoooAKTNH4UA+1ABR9KKKBi0UUfjQIWkoooAKKTNGaAFoBpMn0ozQMcaO9IKXPpQIXFGO9IKWgA4PFIMZwaOlJnPFABnmkNGT6UZ9sUALRSUuKAClpKXigBKKUCk6GgAzRRn2pM+1NgFGDRmikMcetJSmkoELSUd6KAP/U/fiilopgJRRRSAKKXmkoAKKSloAKSl9qTrQMKKKWgAoo9qKBBzRRmigBKM8UUcUxhmil4opAIKWiigQvWkoooASij8aOKADNHFFGKBhmlooxQIWkoooAKKKTigA460ZzRx60vbOaBiUtAo5oABRS0lAgooooASil49aTigaCloooASloooEFFFFACUcUHFH40wDNFLx60lIYZoFFLQIKKKKACkpaSgA4o4paTHvQMKX6UlLQAUUUUCCkpaSmAUZo4o/GkMKWigUAJS0UtAhKKKKAEopfxpBj1oGGRRR9KKAuLRR0ooEFHeiigBM0UUvGaYCZGaKPeikMKWkxS0CCiiigApKWk/GmAZozR+NAxQMM0UtFIAoo96KBAKXkUlBOaAEpODS4pfxoHYSlFGBxRmgQGil75xRQAgpaSjvQAUcHFA+tHHrQAE0lKB70Y7UAFFGKXFADqZS0lNAFFFFID//V/fnvSUvc0HrTAMYopKXvzSADnrR1FFFMBOKSlopAGKMCigUAFFLRQAlFLSc0AGM0mBS0lAC0mKO1KKAExS0tFACUtJRQAUUdKKAExRiiloATFLRRQAUtFFACUUUUAGKTFLSUAGKMClooABwKWiigAoopKAEoxS0lABijAoFLQAUdKX60UAFGe1FJQAUUUlABRilooATFLRS8UAJRS0dsUAFJRSUAFGKKKADAo4paWgAoo9qKACkoooAKTFFFABijApaKAAAUUvaigBOlFLSUAFJiijpQAYoxRS0AGBRR0paACijvSUALSUUlABjtRgUUtACYFLxRS0AJS0Ud6AEoopKACjAoooAMCjApaWgBMCilo7UAFLmkpKAHcmm4x1pKKAFI9qTAFL7UUAOwBTaWigAopRSUAJRRSetAC4oAFFAoAOhopcUCgAFO9abmlzQAZpDRScmgAooooA//1v35oNB60lMBaKSlpAFJmiigAooooAWjiijFABRRR7UAFJRRQAc0CiigApaSl/GgAwKOKKKADikpaSgAooooAKUYopKAFxijiiigA4oopKACjJoooAOaKUUUAHFGBRRQAcUcUGigA47UlFFABRRS0AJS0UfjQAcUcUUfjQAcUlLSZoAKKKKAClxSUtABxRxiiigA4pKWkoAKKKKAClpKWgAo4FFFABxRxRxRQAlFFFABRRSigBKXiijHvQAuBScUUUAFJS0lABRRS0AJS4FFHegA4owKKKADikoooAKKKKACjrS96KADijjFFFABRj0oooASiiigBOaWiloAOKMd6KU9KADik4opKAF4pKKKADmj60UUALRx6UUuPegBMCjij8aKACjNJRQAUvNJ2ooAKWikoAdxScUDiigAox6UD1pelADaKdjvSEc0AJRRSmgD/9f9+TSUd6O1MA5o4opaQCUUuOcUlAC9aMGkpaADkUUHNJyKAFpKOaKACiiigApaSloAKMGikoAXBzSUc0UAFHFFJQAtFFFAC89aOfSkpc0AHNHNJRQAUn40tFABRRRQAUvNFFABzRzSUZoAKKKKAE4opaBQAtIKKM0ALzRyaKKADmk+tFJQAtFJRQAtHNFLQAc4owaDSUALzSc0ZooAKMiikoAWlpOgooAXmjBpKXNABgmjkdaSigAooooAOKKKKAFxRRRQAfhRRSUALzSUGigAopKWgApaSloAOc0YIpKKAF5opKSgBaKSloAKOaKWgBOaXBopKAFwcUc0lFABR70UlAC8UUUUALRg0lFAC4NHNJ7UUAKfekoooAKKQYpTQAUuDSCloAMGjmkooAXmkoooAKKP5UUAFLRSUALzRyaBmigBcE0nNKaSgANHtRS96YCdKKUikNIBTTaWkoA//9D9+D1xRRRQAo60cUnTmigBe1BxSc0tAAKM0lFAC0lFJQAtFJS0AFFFFABRRRQAUUUUAHNFJzS0AJS0UUAFFFFABR9KPeigApPrRRQAtJQKWgYUdKKKBC0UlFABRSUtABSYpeaSgYfSlpBS0CFozSUUAFFGaSgBaKKSgBaKKKACiiigBaTNFFAB1opKMUAGKKWkoAWlpKKAFpDRRQAlLSc0tMBKKKKQxaKBS0CCikooADSUdRRQAUUUUwF9qKSlpAFGaKKACiikoAWkoooAKXFIKWgAooooAX6UlFJmgBaOaSjn1oAMUtHNJQMWiiigQUtJRigAozRSfjTAKKKKQC0UUUAFLSUZoAKKSigBaSjnsaXmgAooo5oAKXpR9aT3oAKDRSfWgBxoBo6GjBpgB9qM802lpAOP1pDigUlABRRRQB//0f3470vbFJRTAKKXtRSAKTtS0lABRQaKACigUUAFHel/CkoAKKKKACiiigAopKWgApKWigAoooxQAUuDSYooAKSlooAKKKKACkpaOtABRRQaAE5paKSgBaOaKKBhRSUtAg9qKKKACijPrRQAUlLSUAFLRRQAhpaKKACjmiigApKWigA+tJS0UAFFFHOKACiiigBKKXFFACc0UtFABR2oooAKKKKADNFFFACUtFFABRRRQAUUUYoAKKKKACkpaKAEopaM4oGFFFFAgooooAKKKOKAEo5o4paAEpaKKACijmigApOaWigBKKXIo+lACDmlo47UUAFFL9aSgA+lFFFACUUvWigYUUUtAhKKUCggdqAFBpOtJ7U7HegBMY60lKaTpTAWgdaOaMc9KQCc0tGKKADNJ7UtJ9aACjrRRQB//9L9+TSUtHSmAlKPekooAXikoooAKKKO9IAooooAKKKKACiiigAoooNABRRRQAYNFFFABRRRQAUUUUAFFFFABS0n40UAFFL2o70AJRRRQAUUUUAFFHWigApaSigAopaSgAooooAKO9FHegAooooAKKKKAFpKKKACijFHSgAooooAPwopaKAEpaSigA+lFFFABRRRQAUUUUAFFGaKACiiigAooooAKKKOtABRRRQAUUUUAFFFFABRxRRQAUUUUAFFFFABRRRQAUUUUAFFFHegAooooAKKKMUALSUUUAH4UUtJQAtIaKKACjrRRigA4pelJS4oASlzRRjmgA98UUc0UAAFLnHFJR3oAO9JS89aWmAZFHak6UZpAFHtRg0c0AFJ9aU0UAJR1oxRQB//2Q=="}
            alt="Winsermant"
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26,
          fontWeight: 900, color: C.ink, lineHeight: 1.1, marginTop: 4 }}>
          Reporte de Caja Chica
        </h1>
        <p style={{ color: C.muted, marginTop: 4, fontSize: 13 }}>
          Winsermant · Ingeniería Electrónica &amp; Comunicaciones
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: 400,
        background: C.surface, borderRadius: 20, padding: 28,
        border: `1.5px solid ${C.border}`,
        boxShadow: "0 4px 32px rgba(0,0,0,0.06)",
        animation: "fadeUp 0.5s ease 0.1s both" }}>

        <div style={{ marginBottom: 18 }}>
          <Lbl>Tu nombre completo</Lbl>
          <Inp value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. María González" />
        </div>
        <div style={{ marginBottom: 24 }}>
          <Lbl>Departamento / Área</Lbl>
          <Inp value={dept} onChange={(e) => setDept(e.target.value)} placeholder="Ej. Ventas, Logística…" />
        </div>

        <Btn full onClick={() => onContinue({ name, dept, folio: "…generando…" })} disabled={!name.trim() || !dept.trim()}>
          Comenzar captura →
        </Btn>
      </div>

      <p style={{ marginTop: 20, color: C.muted, fontSize: 12 }}>
        Powered by Google Vision · Google Sheets
      </p>
    </div>
  );
}

// ══════════════════════════════════════════
//  SCREEN 2 — Captura
// ══════════════════════════════════════════
function CaptureScreen({ employee }) {
  const [invoices, setInvoices] = useState([]);
  const [status, setStatus]     = useState("idle"); // idle | scanning | sending | done
  const [editIdx, setEditIdx]   = useState(null);
  const [error, setError]       = useState("");
  const fileRef = useRef();

  const total     = invoices.reduce((s, i) => s + Number(i.monto || 0), 0);
  const canSend   = invoices.length > 0 && status === "idle";

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setStatus("scanning");
    setError("");
    try {
      const b64  = await toBase64(file);
      const text = await runVisionOCR(b64);
      if (!text) throw new Error("No se detectó texto en la imagen");
      const parsed = parseInvoiceText(text);
      setInvoices((prev) => [
        { id: Date.now(), ...parsed,
          imagePreview: URL.createObjectURL(file), rawText: text },
        ...prev,
      ]);
    } catch (e) {
      setError(e.message || "Error al procesar la imagen");
    } finally {
      setStatus("idle");
      fileRef.current.value = "";
    }
  }, []);

  const [serverFolio, setServerFolio] = useState("");

  const handleSend = async () => {
    setStatus("sending");
    setError("");
    try {
      const res = await sendToSheet(employee, invoices);
      setServerFolio(res.folio || "—");
      setStatus("done");
    } catch (e) {
      setError("No se pudo enviar: " + e.message);
      setStatus("idle");
    }
  };

  if (status === "done") return <SuccessScreen employee={employee} invoices={invoices} total={total} folio={serverFolio} />;

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 16px 100px" }}>
      <style>{css}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22,
            fontWeight: 900, color: C.ink }}>{employee.name}</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{employee.dept}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5,
            background: C.accentLt, color: C.accent, border: `1px solid ${C.accent}44`,
            borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 800,
            letterSpacing: 0.8, marginTop: 6, fontFamily: "monospace" }}>
            📋 Se asignará al enviar
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: 0.6 }}>Total</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26,
            fontWeight: 900, color: C.accent }}>{fmt(total)}</div>
          <div style={{ color: C.muted, fontSize: 12 }}>{invoices.length} factura{invoices.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: C.dangerLt, border: `1px solid #fca5a5`,
          borderRadius: 10, padding: "10px 14px", color: C.danger,
          fontSize: 13, fontWeight: 600, marginBottom: 16, display: "flex", gap: 8 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Zona de captura */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />

      <div
        onClick={() => status === "idle" && fileRef.current.click()}
        style={{
          border: `2px dashed ${status === "scanning" ? C.accent : C.border}`,
          borderRadius: 18, padding: "32px 20px", textAlign: "center",
          cursor: status === "idle" ? "pointer" : "default",
          background: status === "scanning" ? C.accentLt : C.card,
          transition: "all 0.2s", marginBottom: 24,
          animation: status === "scanning" ? "pulse 1.2s ease infinite" : "none",
        }}
      >
        {status === "scanning" ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <Loader label="Google Vision analizando…" />
            <span style={{ color: C.muted, fontSize: 13 }}>
              Extrayendo proveedor, monto y fecha
            </span>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📷</div>
            <div style={{ fontWeight: 700, fontSize: 17, color: C.ink }}>
              Fotografiar factura
            </div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
              Google Vision leerá el texto automáticamente
            </div>
          </>
        )}
      </div>

      {/* Lista de facturas */}
      {invoices.length > 0 && (
        <div>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700,
            letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 12 }}>
            Facturas capturadas
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {invoices.map((inv, idx) => (
              <InvoiceCard
                key={inv.id}
                inv={inv}
                onEdit={() => setEditIdx(idx)}
                onDelete={() => setInvoices((p) => p.filter((_, i) => i !== idx))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Footer flotante */}
      {invoices.length > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: C.surface + "f2", backdropFilter: "blur(14px)",
          borderTop: `1.5px solid ${C.border}`,
          padding: "14px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <div style={{ fontWeight: 700, color: C.ink, fontSize: 16 }}>{fmt(total)}</div>
            <div style={{ color: C.muted, fontSize: 12 }}>
              {invoices.length} factura{invoices.length !== 1 ? "s" : ""}
            </div>
          </div>
          <Btn onClick={handleSend} disabled={!canSend}>
            {status === "sending"
              ? <Loader label="Enviando…" />
              : "Enviar a Administración ✓"}
          </Btn>
        </div>
      )}

      {/* Modal edición */}
      {editIdx !== null && (
        <EditModal
          inv={invoices[editIdx]}
          onSave={(upd) => {
            setInvoices((p) => p.map((item, i) => i === editIdx ? { ...item, ...upd } : item));
            setEditIdx(null);
          }}
          onClose={() => setEditIdx(null)}
        />
      )}
    </div>
  );
}

// ─── Tarjeta factura ──────────────────────
function InvoiceCard({ inv, onEdit, onDelete }) {
  const col = CAT_COLOR[inv.categoria] || C.muted;
  return (
    <div style={{
      background: C.surface, borderRadius: 14, border: `1.5px solid ${C.border}`,
      overflow: "hidden", animation: "fadeUp 0.3s ease",
    }}>
      <div style={{ display: "flex", gap: 12, padding: "14px 14px 10px" }}>
        {inv.imagePreview && (
          <img src={inv.imagePreview} alt=""
            style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", flexShrink: 0,
              border: `1px solid ${C.border}` }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ fontWeight: 700, color: C.ink, fontSize: 15,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
              {inv.proveedor || "Sin nombre"}
            </div>
            <div style={{ fontFamily: "'Playfair Display', serif",
              color: C.accent, fontWeight: 900, fontSize: 17, flexShrink: 0, marginLeft: 8 }}>
              {fmt(inv.monto)}
            </div>
          </div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {inv.descripcion}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <Pill label={inv.categoria} color={col} />
            <Pill label={inv.fecha} color={C.stamp} />
            {inv.numero_factura && <Pill label={`#${inv.numero_factura}`} color={C.muted} />}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", borderTop: `1px solid ${C.border}` }}>
        {[
          { label: "✏️ Editar",  action: onEdit,   col: C.ink    },
          { label: "🗑️ Borrar", action: onDelete, col: C.danger },
        ].map(({ label, action, col: fc }) => (
          <button key={label} onClick={action} style={{
            flex: 1, background: "none", border: "none",
            padding: "9px 4px", cursor: "pointer",
            color: fc, fontSize: 13, fontWeight: 600,
            fontFamily: "inherit", transition: "background 0.15s",
          }}>{label}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Modal edición ────────────────────────
function EditModal({ inv, onSave, onClose }) {
  const [f, setF] = useState({ ...inv });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000088", zIndex: 200,
      display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: C.surface, borderRadius: "20px 20px 0 0",
        padding: 24, width: "100%", maxHeight: "88vh", overflowY: "auto",
        border: `1.5px solid ${C.border}` }}>

        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20,
            fontWeight: 900, color: C.ink }}>Editar factura</h3>
          <button onClick={onClose} style={{ background: "none", border: "none",
            color: C.muted, fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>

        {[
          { k: "proveedor",      label: "Proveedor / Comercio" },
          { k: "descripcion",    label: "Descripción" },
          { k: "fecha",          label: "Fecha",    type: "date" },
          { k: "monto",          label: "Monto (₡)", type: "number" },
          { k: "numero_factura", label: "N° Factura" },
        ].map(({ k, label, type }) => (
          <div key={k} style={{ marginBottom: 14 }}>
            <Lbl>{label}</Lbl>
            <Inp value={f[k] || ""} onChange={set(k)} type={type} />
          </div>
        ))}

        <div style={{ marginBottom: 20 }}>
          <Lbl>Categoría</Lbl>
          <select value={f.categoria}
            onChange={(e) => setF((p) => ({ ...p, categoria: e.target.value }))}
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 9,
              padding: "10px 13px", fontSize: 15, fontFamily: "inherit",
              background: C.surface, color: C.ink }}>
            {CATS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>

        <Btn full onClick={() => onSave(f)}>Guardar cambios</Btn>
      </div>
    </div>
  );
}

// ─── Pantalla éxito ───────────────────────
function SuccessScreen({ employee, invoices, total, folio }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
      background: `linear-gradient(160deg, ${C.bg} 60%, ${C.accentLt})` }}>
      <style>{css}</style>

      <div style={{ width: 72, height: 72, borderRadius: "50%",
        background: C.accent, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 34, marginBottom: 20,
        boxShadow: `0 8px 32px ${C.accent}55`, animation: "fadeUp 0.4s ease" }}>
        ✓
      </div>

      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28,
        fontWeight: 900, color: C.ink, marginBottom: 8, animation: "fadeUp 0.4s ease 0.1s both" }}>
        ¡Cierre enviado!
      </h2>
      <p style={{ color: C.muted, fontSize: 15, marginBottom: 32, textAlign: "center",
        animation: "fadeUp 0.4s ease 0.15s both" }}>
        La administración ya puede ver tus facturas en Google Sheets
      </p>

      <div style={{ width: "100%", maxWidth: 400, background: C.surface,
        borderRadius: 18, padding: 24, border: `1.5px solid ${C.border}`,
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)", animation: "fadeUp 0.4s ease 0.2s both" }}>
        {[
          ["N° Reporte",        folio, false, true],
          ["Empleado",          employee.name],
          ["Área",              employee.dept],
          ["Facturas enviadas", invoices.length],
          ["Total a reembolsar", fmt(total), true],
        ].map(([label, value, accent, mono]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between",
            padding: "11px 0", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ color: C.muted, fontSize: 14 }}>{label}</span>
            <span style={{ color: accent ? C.accent : C.ink, fontWeight: accent ? 900 : 700,
              fontSize: accent ? 18 : 14,
              fontFamily: mono ? "monospace" : accent ? "'Playfair Display', serif" : "inherit" }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 24, color: C.muted, fontSize: 13, textAlign: "center",
        maxWidth: 320, animation: "fadeUp 0.4s ease 0.25s both" }}>
        Recibirás el depósito una vez que administración apruebe el cierre en el Sheet.
      </p>
    </div>
  );
}

// ══════════════════════════════════════════
//  APP ROOT
// ══════════════════════════════════════════
export default function App() {
  const [employee, setEmployee] = useState(null);
  return (
    <>
      <style>{css}</style>
      {!employee
        ? <EmployeeScreen onContinue={setEmployee} />
        : <CaptureScreen employee={employee} />}
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   GOOGLE APPS SCRIPT — pega esto en script.google.com
   ════════════════════════════════════════════════════════════

const SPREADSHEET_ID = "TU_SPREADSHEET_ID_AQUI";

// ── Genera folio global en el servidor ──────────────────────────
// Formato: AAAA-MM-NNN  (ej. 2026-05-005)
// El contador vive en PropertiesService → es global para TODOS
// los empleados y se resetea automáticamente cada mes.
function getNextFolio() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // espera hasta 10 s si hay envíos simultáneos

  try {
    const props = PropertiesService.getScriptProperties();
    const now   = new Date();
    const year  = now.getFullYear();
    const mon   = String(now.getMonth() + 1).padStart(2, "0");
    const key   = `folio_${year}_${mon}`;

    // Primer reporte del mes → arranca en 4 para que el folio sea 005
    const prev  = parseInt(props.getProperty(key) || "4", 10);
    const next  = prev + 1;
    props.setProperty(key, String(next));

    return `${year}-${mon}-${String(next).padStart(3, "0")}`;
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  try {
    const data  = JSON.parse(e.postData.contents);
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const folio = getNextFolio(); // ← asignado aquí, no viene del cliente

    // ── Hoja: Facturas (detalle) ──────────────────────────────
    let sheetF = ss.getSheetByName("Facturas");
    if (!sheetF) {
      sheetF = ss.insertSheet("Facturas");
      const hdr = ["N° Reporte","Timestamp","Empleado","Área","Fecha Factura",
                   "Proveedor","Descripción","Categoría","N° Factura","Monto (₡)","Estado"];
      sheetF.appendRow(hdr);
      const r = sheetF.getRange(1,1,1,hdr.length);
      r.setFontWeight("bold").setBackground("#1a6b3c").setFontColor("#ffffff");
      sheetF.setFrozenRows(1);
    }

    data.invoices.forEach(inv => {
      sheetF.appendRow([
        folio,
        data.timestamp,
        data.employee.name,
        data.employee.dept,
        inv.fecha,
        inv.proveedor,
        inv.descripcion,
        inv.categoria,
        inv.numero_factura || "",
        Number(inv.monto) || 0,
        "Pendiente"
      ]);
    });

    // ── Hoja: Resumen (un registro por cierre) ────────────────
    let sheetR = ss.getSheetByName("Resumen");
    if (!sheetR) {
      sheetR = ss.insertSheet("Resumen");
      const hdr = ["N° Reporte","Timestamp","Empleado","Área","N° Facturas","Total (₡)","Estado","Notas"];
      sheetR.appendRow(hdr);
      const r = sheetR.getRange(1,1,1,hdr.length);
      r.setFontWeight("bold").setBackground("#1a6b3c").setFontColor("#ffffff");
      sheetR.setFrozenRows(1);
    }
    const totalAmt = data.invoices.reduce((s,i) => s + (Number(i.monto) || 0), 0);
    sheetR.appendRow([
      folio,
      data.timestamp,
      data.employee.name,
      data.employee.dept,
      data.invoices.length,
      totalAmt,
      "Pendiente",
      ""
    ]);

    // Devuelve el folio al cliente para mostrarlo en pantalla
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, folio }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok" }))
    .setMimeType(ContentService.MimeType.JSON);
}

   ════════════════════════════════════════════════════════════ */
