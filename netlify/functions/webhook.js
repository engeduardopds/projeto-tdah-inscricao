// Importa a biblioteca axios para fazer requisições HTTP
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const nodemailer = require('nodemailer');

// Funções de resposta padrão
const ok = (obj) => ({ statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj || { ok: true }) });
const err = (code, msg) => ({ statusCode: code, body: msg });

// Função para enviar o e-mail de boas-vindas com Senha de App
async function sendWelcomeEmail(customerData) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_ADDRESS,
                pass: process.env.GMAIL_APP_PASSWORD, // Usando a senha de aplicativo
            },
        });

        const mailOptions = {
            from: `Fazendo as Pazes com o TDAH <${process.env.GMAIL_ADDRESS}>`,
            to: customerData.email,
            subject: 'Bem-vindo(a) ao Curso "Fazendo as Pazes com o seu TDAH"!',
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                    <h2>Olá, ${customerData.name}!</h2>
                    <p>Sua inscrição no curso <strong>Fazendo as Pazes com o seu TDAH</strong> foi confirmada com sucesso!</p>
                    <p>Estamos muito felizes em ter você conosco nesta jornada de aprendizado e bem-estar.</p>
                    <p>Em breve, você receberá mais informações sobre o acesso ao material do curso e as datas importantes.</p>
                    <p>Atenciosamente,<br>Equipe Fazendo as Pazes com o seu TDAH</p>
                </div>
            `,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('E-mail de boas-vindas enviado com sucesso:', info.response);

    } catch (error) {
        console.error('Erro ao tentar enviar e-mail com Nodemailer:', error);
    }
}


// Função para adicionar os dados na planilha
async function appendToSheet(customerData, paymentData) {
    try {
        const auth = new GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        const newRow = [
            new Date().toLocaleString('pt-BR'),
            customerData.name,
            customerData.email,
            paymentData.description.includes('Online') ? 'Online' : 'Presencial',
            paymentData.value,
            paymentData.status,
            paymentData.id,
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


exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return err(405, "Method Not Allowed");

    // Validação do Token de Segurança
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
    const receivedToken = event.headers['asaas-access-token'];
    if (!expectedToken || receivedToken !== expectedToken) {
        return err(401, "Unauthorized");
    }

    try {
        const notification = JSON.parse(event.body || "{}");
        const paymentData = notification.payment || {};
        const eventType = notification.event;

        // Validação do evento - processar apenas pagamentos confirmados/recebidos
        if (eventType !== 'PAYMENT_CONFIRMED' && eventType !== 'PAYMENT_RECEIVED') {
            return ok({ received: true, ignored: true, reason: 'Event type not processed' });
        }

        // --- NOVA VALIDAÇÃO PARA IGNORAR PARCELAS SUBSEQUENTES ---
        // O Asaas envia um webhook para cada parcela. Queremos agir apenas na primeira.
        if (paymentData.installmentNumber && paymentData.installmentNumber > 1) {
            console.log(`Ignorando parcela ${paymentData.installmentNumber} do pagamento ${paymentData.id}. Ação já executada na primeira parcela.`);
            return ok({ received: true, ignored: true, reason: 'Subsequent installment' });
        }
        // -----------------------------------------------------------

        // Obter os dados completos do cliente a partir da API do Asaas
        const customerResponse = await axios.get(`https://sandbox.asaas.com/api/v3/customers/${paymentData.customer}`, {
            headers: { 'access_token': process.env.ASAAS_API_KEY }
        });
        const customerData = customerResponse.data;

        // Executar as duas ações em paralelo para mais eficiência
        await Promise.all([
            appendToSheet(customerData, paymentData),
            sendWelcomeEmail(customerData)
        ]);

        console.log("WEBHOOK PROCESSADO:", { type: eventType, paymentId: paymentData.id, status: paymentData.status });
        return ok({ received: true });

    } catch (error) {
        console.error("Erro no processamento do webhook:", error.response ? error.response.data : error.message);
        // Mesmo em caso de erro, retornamos 200 para o Asaas não continuar a reenviar.
        // O erro já foi logado para análise.
        return ok({ received: true, error: "Internal processing failed" });
    }
};

