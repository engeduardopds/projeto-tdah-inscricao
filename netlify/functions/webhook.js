// netlify/functions/webhook.js
const ok  = (obj) => ({ statusCode: 200, headers: {"Content-Type":"application/json"}, body: JSON.stringify(obj||{ok:true}) });
const err = (code, msg) => ({ statusCode: code, body: msg });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return err(405, "Method Not Allowed");

  // 1) Autenticação do webhook (token configurado no Asaas)
  const expected = process.env.ASAAS_WEBHOOK_TOKEN || "";
  const got = event.headers["asaas-access-token"] || "";
  if (expected && got !== expected) return err(401, "Unauthorized");

  // 2) Parse do evento
  let n = {};
  try { n = JSON.parse(event.body || "{}"); } catch { return ok({ignored:true, reason:"bad json"}); }
  const type = n.event || n.type || "";
  const paymentId = n?.payment?.id || n?.data?.id || null;

  // 3) Confirmar status no Asaas (recomendado)
  let confirmed = false;
  let email = n?.customer?.email || n?.checkout?.customerData?.email || "";
  try {
    if (paymentId) {
      const r = await fetch(`${process.env.ASAAS_BASE || "https://api-sandbox.asaas.com/v3"}/payments/${paymentId}`, {
        headers: { "access_token": process.env.ASAAS_API_KEY }
      });
      const pay = await r.json();
      const st = String(pay?.status || "").toUpperCase(); // RECEIVED, RECEIVED_IN_CASH, CONFIRMED...
      confirmed = ["RECEIVED","RECEIVED_IN_CASH","CONFIRMED"].includes(st);
      // tente extrair e-mail do pagamento, se disponível
      email = email || pay?.customer?.email || pay?.customerEmail || "";
      console.log("PAYMENT CHECK", paymentId, st);
    } else if (["CHECKOUT_PAID","PAYMENT_CONFIRMED","PAYMENT_RECEIVED"].includes(type)) {
      confirmed = true; // fallback quando não vier paymentId no payload
    }
  } catch (e) {
    console.log("PAYMENT CHECK ERROR:", e.message);
  }

  // 4) Ação pós-pagamento (ex.: enviar e-mail)
  if (confirmed && email && process.env.RESEND_API_KEY && process.env.FROM_EMAIL) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: process.env.FROM_EMAIL,
          to: [email],
          subject: "Acesso ao curso — Fazendo as Pazes com o seu TDAH",
          html: `<p>Olá! 🎉</p>
                 <p>Seu pagamento foi confirmado.</p>
                 <p><a href="https://SEU-LINK-DO-CURSO">Clique aqui para acessar o curso</a></p>
                 <p>Qualquer dúvida, responda este e-mail.</p>`
        })
      });
      console.log("EMAIL SENT to", email);
    } catch (e) {
      console.log("EMAIL ERROR:", e.message);
    }
  }

  // 5) Sempre finalize com 200 para o Asaas não reprocessar indefinidamente
  return ok({ received:true, type, paymentId, confirmed });
};
