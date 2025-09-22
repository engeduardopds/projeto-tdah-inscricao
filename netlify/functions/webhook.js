// Importa as novas bibliotecas
const { google } = require('googleapis');
const { Resend } = require('resend');

// --- Seu código de webhook existente ---
const ok = (obj) => ({ statusCode: 200, headers: { "Content-Type":"application/json" }, body: JSON.stringify(obj||{ok:true}) });
const err = (code, msg) => ({ statusCode: code, body: msg });

// Função para adicionar dados à Planilha Google
async function appendToSheet(paymentData) {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                // Corrige a formatação da chave privada que vem do Netlify
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        
        const newRow = [
            new Date().toLocaleString('pt-BR'), // Data Inscrição
            paymentData.customer.name,          // Nome
            paymentData.customer.email,         // Email
            paymentData.description.includes('Online') ? 'Online' : 'Presencial', // Modalidade
            paymentData.value,                  // Valor
            paymentData.status,                 // Status Pagamento
            paymentData.id,                     // ID Pagamento
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'A1', // A API vai encontrar a próxima linha vazia automaticamente
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [newRow],
            },
        });
        console.log('Dados adicionados à planilha com sucesso.');

    } catch (error) {
        console.error('Erro ao adicionar dados na planilha:', error);
        // Não retornamos um erro aqui para não falhar o webhook inteiro
    }
}

// Função para enviar o e-mail de boas-vindas
async function sendWelcomeEmail(paymentData) {
    try {
        const resend = new Resend(process.env.RESEND_API_KEY);

        await resend.emails.send({
            // Para testes, o Resend usa 'onboarding@resend.dev'. Para produção, você precisa verificar seu domínio.
            from: 'onboarding@resend.dev',
            to: paymentData.customer.email,
            subject: 'Sua inscrição no curso "Fazendo as Pazes com o seu TDAH" foi confirmada!',
            html: `
                <h1>Olá, ${paymentData.customer.name}!</h1>
                <p>Seja muito bem-vindo(a)! Sua inscrição no curso <strong>Fazendo as Pazes com o seu TDAH</strong> foi confirmada com sucesso.</p>
                <p>Modalidade: ${paymentData.description.includes('Online') ? 'Online' : 'Presencial'}</p>
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
    // --- Todo o seu código de validação de token e parse do payload continua aqui ---
    if (event.httpMethod !== "POST") return err(405, "Method Not Allowed");
    const H = {};
    for (const [k,v] of Object.entries(event.headers || {})) H[(k || "").toLowerCase().replace(/[-_]/g, "")] = v;
    const expected = (process.env.ASAAS_WEBHOOK_TOKEN || "").trim();
    const got = (H["asaasaccesstoken"] || H["xasaasaccesstoken"] || (H["authorization"] || "").replace(/^bearer\s+/i,"")).trim();
    if (expected && got !== expected) return err(401, "Unauthorized");

    let n = {};
    try { n = JSON.parse(event.body || "{}"); } catch { return ok({ ignored:true, reason:"bad json" }); }

    const payment = n.payment || {}; // Pegamos o objeto de pagamento inteiro

    // --- LÓGICA DE NEGÓCIO ---
    // Verificamos se o status é confirmado
    if (payment.status === 'CONFIRMED' || payment.status === 'RECEIVED') {
        
        // Executamos as duas novas ações em paralelo para mais eficiência
        await Promise.all([
            appendToSheet(payment),
            sendWelcomeEmail(payment)
        ]);
    }

    console.log("WEBHOOK PROCESSADO:", { type: n.event, paymentId: payment.id, status: payment.status });
    return ok({ received: true });
};
