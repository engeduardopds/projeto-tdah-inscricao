// Importa as bibliotecas necessárias
const axios = require('axios');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const nodemailer = require('nodemailer');

// Funções de resposta padrão
const ok = (obj) => ({ statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj || { ok: true }) });
const err = (code, msg) => ({ statusCode: code, body: msg });

// Função para enviar o e-mail de boas-vindas com OAuth 2.0
async function sendWelcomeEmail(customerData) {
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GMAIL_CLIENT_ID,
            process.env.GMAIL_CLIENT_SECRET,
            'https://developers.google.com/oauthplayground'
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.GMAIL_REFRESH_TOKEN
        });

        const accessToken = await oauth2Client.getAccessToken();

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: process.env.GMAIL_ADDRESS,
                clientId: process.env.GMAIL_CLIENT_ID,
                clientSecret: process.env.GMAIL_CLIENT_SECRET,
                refreshToken: process.env.GMAIL_REFRESH_TOKEN,
                accessToken: accessToken.token,
            },
        });

        const mailOptions = {
            from: `Fazendo as pazes com seu TDAH <${process.env.GMAIL_ADDRESS}>`,
            to: customerData.email,
            subject: 'Bem-vindo(a) ao Curso "Fazendo as pazes com seu TDAH"!',
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                    <h2>Olá, ${customerData.name}!</h2>
                    <p>Sua inscrição no curso <strong>Fazendo as pazes com seu TDAH</strong> foi confirmada com sucesso!</p>
                    <p>Estamos muito felizes em ter você conosco nesta jornada de aprendizado e bem-estar.</p>
                    <p>Em breve, você receberá mais informações sobre o acesso ao material do curso e as datas importantes.</p>
                    <p>Atenciosamente,<br>Equipe Fazendo as pazes com seu TDAH</p>
                </div>
            `,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('E-mail de boas-vindas enviado com sucesso:', info.response);

    } catch (error) {
        console.error('Erro ao tentar enviar e-mail com OAuth 2.0:', error);
    }
}


// Função para adicionar os dados na planilha
async function appendToSheet(customerData, paymentData, installmentsCount, externalReference) {
    try {
        const auth = new GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        
        const refData = JSON.parse(externalReference || '{}');
        const objectiveMap = { prof: "Profissional da saúde", pessoal: "Tenho TDAH", convivo: "Convivo com TDAH" };
        const sourceMap = { insta: "Instagram", amigos: "Indicação de amigos" };
        
        const objectiveText = objectiveMap[refData.o] || refData.o || '';
        const sourceText = sourceMap[refData.s] || refData.s || '';

        const newRow = [
            new Date().toLocaleString('pt-BR'),
            customerData.name,
            customerData.email,
            paymentData.description.includes('Online') ? 'Online' : 'Presencial',
            paymentData.value,
            paymentData.status,
            paymentData.id,
            paymentData.billingType === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'Boleto ou PIX',
            installmentsCount > 1 ? installmentsCount : '-',
            objectiveText,
            sourceText,
            refData.c || '',
            refData.ip || ''
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

    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
    const receivedToken = event.headers['asaas-access-token'];
    if (!expectedToken || receivedToken !== expectedToken) {
        return err(401, "Unauthorized");
    }

    try {
        const notification = JSON.parse(event.body || "{}");
        const paymentData = notification.payment || {};
        const eventType = notification.event;

        if (eventType !== 'PAYMENT_CONFIRMED' && eventType !== 'PAYMENT_RECEIVED') {
            return ok({ received: true, ignored: true, reason: 'Event type not processed' });
        }

        if (paymentData.installmentNumber && paymentData.installmentNumber > 1) {
            return ok({ received: true, ignored: true, reason: 'Subsequent installment' });
        }
        
        let totalInstallments = 1;
        const asaasApiUrl = 'https://api.asaas.com/api/v3'; // URL DE PRODUÇÃO

        if (paymentData.installment) {
            const installmentDetails = await axios.get(`${asaasApiUrl}/installments/${paymentData.installment}`, {
                headers: { 'access_token': process.env.ASAAS_API_KEY }
            });
            totalInstallments = installmentDetails.data.installmentCount;
        }

        const customerResponse = await axios.get(`${asaasApiUrl}/customers/${paymentData.customer}`, {
            headers: { 'access_token': process.env.ASAAS_API_KEY }
        });
        const customerData = customerResponse.data;

        await Promise.all([
            appendToSheet(customerData, paymentData, totalInstallments, paymentData.externalReference),
            sendWelcomeEmail(customerData)
        ]);

        console.log("WEBHOOK PROCESSADO:", { type: eventType, paymentId: paymentData.id, status: paymentData.status });
        return ok({ received: true });

    } catch (error) {
        console.error("Erro no processamento do webhook:", error.response ? error.response.data : error.message);
        return ok({ received: true, error: "Internal processing failed" });
    }
};

