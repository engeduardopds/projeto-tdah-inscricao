// netlify/functions/webhook.js
const ok  = (obj) => ({ statusCode: 200, headers: { "Content-Type":"application/json" }, body: JSON.stringify(obj||{ok:true}) });
const err = (code, msg) => ({ statusCode: code, body: msg });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return err(405, "Method Not Allowed");

  // headers case-insensitive
  const H = {};
  for (const [k,v] of Object.entries(event.headers || {})) H[k.toLowerCase()] = v;

  // token esperado (Netlify env)
  const expected = process.env.ASAAS_WEBHOOK_TOKEN || "";
  // token recebido (tente variações comuns)
  const got =
    H["asaas-access-token"] ||
    H["x-asaas-access-token"] ||
    (H["authorization"] ? H["authorization"].replace(/^bearer\s+/i,"") : "") ||
    "";

  if (expected && got !== expected) {
    console.log("WEBHOOK AUTH FAIL:", { expectedSet: !!expected, gotPresent: !!got, headers: H });
    return err(401, "Unauthorized");
  }

  // parse payload
  let n = {};
  try { n = JSON.parse(event.body || "{}"); } catch (_) { return ok({ ignored: true, reason: "bad json" }); }

  const type = n.event || n.type || "";
  const paymentId = n?.payment?.id || n?.data?.id || null;

  // (opcional) confirmar status no Asaas
  let confirmed = false;
  try {
    if (paymentId) {
      const base = process.env.ASAAS_BASE || "https://api-sandbox.asaas.com/v3";
      const r = await fetch(`${base}/payments/${paymentId}`, { headers: { "access_token": process.env.ASAAS_API_KEY } });
      const pay = await r.json();
      const st = String(pay?.status || "").toUpperCase();
      confirmed = ["RECEIVED","RECEIVED_IN_CASH","CONFIRMED"].includes(st);
      console.log("PAYMENT CHECK:", paymentId, st);
    } else if (["CHECKOUT_PAID","PAYMENT_CONFIRMED","PAYMENT_RECEIVED"].includes(type)) {
      confirmed = true;
    }
  } catch (e) {
    console.log("PAYMENT CHECK ERROR:", e.message);
  }

  // aqui você faria: enviar e-mail, registrar em planilha/DB etc.
  console.log("WEBHOOK OK:", { type, paymentId, confirmed });

  return ok({ received: true, type, paymentId, confirmed });
};
