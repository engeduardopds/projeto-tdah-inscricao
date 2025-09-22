// Importa as novas bibliotecas e o axios
const { google } = require('googleapis');
const { Resend } = require('resend');
const axios = require('axios');

// --- Seu código de webhook existente ---
const ok = (obj) => ({ statusCode: 200, headers: { "Content-Type":"application/json" }, body: JSON.stringify(obj||{ok:true}) });
const err = (code, msg) => ({ statusCode: code, body: msg });

// Função para adicionar dados à Planilha Google (sem alterações)
async function appendToSheet(fullPaymentData) {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        
        const newRow = [
            new Date().toLocaleString('pt-BR'), 
            fullPaymentData.customer.name, // Agora teremos o nome
            fullPaymentData.customer.email, // Agora teremos o email
            fullPaymentData.description.includes('Online') ? 'Online' : 'Presencial',
            fullPaymentData.value,
            fullPaymentData.status,
            fullPaymentData.id,
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [newRow],
            },
        });
        console.log('Dados adicionados à planilha com sucesso.');

    } catch (error) {
        console.error('Erro ao adicionar dados na planilha:', error);
    }
}

// Função para enviar o e-mail de boas-vindas (sem alterações)
async function sendWelcomeEmail(fullPaymentData) {
    try {
        const resend = new Resend(process.env.RESEND_API_KEY);

        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: fullPaymentData.customer.email, // Agora teremos o email
            subject: 'Sua inscrição no curso "Fazendo as Pazes com o seu TDAH" foi confirmada!',
            html: `
                <h1>Olá, ${fullPaymentData.customer.name}!</h1>
                <p>Seja muito bem-vindo(a)! Sua inscrição no curso <strong>Fazendo as Pazes com o seu TDAH</strong> foi confirmada com sucesso.</p>
                <p>Modalidade: ${fullPaymentData.description.includes('Online') ? 'Online' : 'Presencial'}</p>
                <p>Em breve você receberá mais informações sobre o início das aulas.</p>
                <p>Atenciosamente,<br>Equipe Fazendo as Pazes com o seu TDAH</p>
            `,
        });
        console.log('E-mail de boas-vindas enviado com sucesso.');
    } catch (error) {
        console.error('Erro ao enviar e-mail:', error);
    }
}


exports.handler = async (event) => {
    // --- Validação do webhook (sem alterações) ---
    if (event.httpMethod !== "POST") return err(405, "Method Not Allowed");
    const H = {};
    for (const [k,v] of Object.entries(event.headers || {})) H[(k || "").toLowerCase().replace(/[-_]/g, "")] = v;
    const expected = (process.env.ASAAS_WEBHOOK_TOKEN || "").trim();
    const got = (H["asaasaccesstoken"] || H["xasaasaccesstoken"] || (H["authorization"] || "").replace(/^bearer\s+/i,"")).trim();
    if (expected && got !== expected) return err(401, "Unauthorized");

    let n = {};
    try { n = JSON.parse(event.body || "{}"); } catch { return ok({ ignored:true, reason:"bad json" }); }

    const payment = n.payment || {}; 

    // --- LÓGICA DE NEGÓCIO ATUALIZADA ---
    if (payment.status === 'CONFIRMED' || payment.status === 'RECEIVED') {
        try {
            // 1. Buscamos os dados completos do cliente no Asaas usando o ID do cliente
            const customerId = payment.customer;
            const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
            const asaasApiUrl = `https://sandbox.asaas.com/api/v3/customers/${customerId}`;
            
            const customerResponse = await axios.get(asaasApiUrl, {
                headers: { 'access_token': ASAAS_API_KEY }
            });
            
            // 2. Criamos um novo objeto de pagamento com os dados completos do cliente
            const fullPaymentData = {
                ...payment,
                customer: customerResponse.data 
            };
            
            // 3. Executamos as ações com os dados completos
            await Promise.all([
                appendToSheet(fullPaymentData),
                sendWelcomeEmail(fullPaymentData)
            ]);

        } catch (error) {
            console.error("Erro ao processar lógica de negócio do webhook:", error.response ? error.response.data : error.message);
        }
    }

    console.log("WEBHOOK PROCESSADO:", { type: n.event, paymentId: payment.id, status: payment.status });
    return ok({ received: true });
};
