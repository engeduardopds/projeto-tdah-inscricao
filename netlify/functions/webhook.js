// netlify/functions/webhook.js
const ok  = (obj) => ({ statusCode: 200, headers: { "Content-Type":"application/json" }, body: JSON.stringify(obj||{ok:true}) });
const err = (code, msg) => ({ statusCode: code, body: msg });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return err(405, "Method Not Allowed");

  // Normaliza headers (case-insensitive) e também remove - e _
  const raw = event.headers || {};
  const normKey = (s) => (s || "").toLowerCase().replace(/[-_]/g, "");
  const H = {};
  for (const [k,v] of Object.entries(raw)) H[normKey(k)] = v;

  // 1) Autenticação por token
  const expected = (process.env.ASAAS_WEBHOOK_TOKEN || "").trim();
  const got = (
    H["asaasaccesstoken"] ||       // asaas-access-token / asaas_access_token
    H["xasaasaccesstoken"] ||      // alguma CDN pode prefixar
    (H["authorization"] || "").replace(/^bearer\s+/i,"") // fallback
  ).trim();

  if (expected && got !== expected) {
    console.log("WEBHOOK AUTH FAIL", {
      expectedSet: !!expected,
      gotPresent: !!got,
      gotSample: got ? got.slice(0,4)+"…"+got.slice(-4) : "",
      headersSeen: Object.keys(H).slice(0,10)
    });
    return err(401, "Unauthorized");
  }

  // 2) Parse do payload
  let n = {};
  try { n = JSON.parse(event.body || "{}"); } catch { return ok({ ignored:true, reason:"bad json" }); }

  const type = n.event || n.type || "";
  const paymentId = n?.payment?.id || n?.data?.id || null;

  // 3) (Opcional, recomendado) confirmar status no Asaas
  let confirmed = false;
  try {
    if (paymentId) {
      const base = process.env.ASAAS_BASE || "https://api-sandbox.asaas.com/v3";
      const r = await fetch(`${base}/payments/${paymentId}`, {
        headers: { "access_token": process.env.ASAAS_API_KEY }
      });
      const pay = await r.json();
      const st = String(pay?.status || "").toUpperCase(); // RECEIVED / CONFIRMED etc.
      confirmed = ["RECEIVED","RECEIVED_IN_CASH","CONFIRMED"].includes(st);
      console.log("PAYMENT CHECK:", paymentId, st);
    } else if (["CHECKOUT_PAID","PAYMENT_CONFIRMED","PAYMENT_RECEIVED"].includes(type)) {
      confirmed = true;
    }
  } catch (e) {
    console.log("PAYMENT CHECK ERROR:", e.message);
  }

  console.log("WEBHOOK OK:", { type, paymentId, confirmed });
  return ok({ received:true, type, paymentId, confirmed });
};
