// Importa as novas bibliotecas e o axios
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const nodemailer = require('nodemailer');
const axios = require('axios');

// --- Funções auxiliares ---
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
            fullPaymentData.customer.name,
            fullPaymentData.customer.email,
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

// NOVA FUNÇÃO para enviar o e-mail de boas-vindas com Nodemailer e Gmail
async function sendWelcomeEmail(fullPaymentData) {
    try {
        const { GMAIL_ADDRESS, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;

        // Configura o cliente OAuth2
        const oauth2Client = new OAuth2Client(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
        oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

        // Obtém um novo token de acesso
        const accessToken = await oauth2Client.getAccessToken();

        // Configura o "transporter" do Nodemailer
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: GMAIL_ADDRESS,
                clientId: GMAIL_CLIENT_ID,
                clientSecret: GMAIL_CLIENT_SECRET,
                refreshToken: GMAIL_REFRESH_TOKEN,
                accessToken: accessToken.token,
            },
        });

        // Envia o e-mail
        const mailOptions = {
            from: `Fazendo as Pazes com o TDAH <${GMAIL_ADDRESS}>`,
            to: fullPaymentData.customer.email,
            subject: 'Sua inscrição no curso "Fazendo as Pazes com o seu TDAH" foi confirmada!',
            html: `
                <h1>Olá, ${fullPaymentData.customer.name}!</h1>
                <p>Seja muito bem-vindo(a)! Sua inscrição no curso <strong>Fazendo as Pazes com o seu TDAH</strong> foi confirmada com sucesso.</p>
                <p>Modalidade: ${fullPaymentData.description.includes('Online') ? 'Online' : 'Presencial'}</p>
                <p>Em breve você receberá mais informações sobre o início das aulas.</p>
                <p>Atenciosamente,<br>Equipe Fazendo as Pazes com o seu TDAH</p>
            `,
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('E-mail de boas-vindas enviado com sucesso:', result.response);

    } catch (error)        console.error("Erro ao processar lógica de negócio do webhook:", error.response ? error.response.data : error.message);
        }
    }

    console.log("WEBHOOK PROCESSADO:", { type: n.event, paymentId: payment.id, status: payment.status });
    return ok({ received: true });
};
