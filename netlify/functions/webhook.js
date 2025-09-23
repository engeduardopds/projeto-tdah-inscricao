// Importa as bibliotecas necessárias
const axios = require('axios');
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
                pass: process.env.GMAIL_APP_PASSWORD, 
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
            refData.objective || '',
            refData.source || '',
            refData.coupon || ''
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
        // Se a notificação for de uma parcela, buscamos o total de parcelas da venda
        if (paymentData.installment) {
            const installmentDetails = await axios.get(`https://sandbox.asaas.com/api/v3/installments/${paymentData.installment}`, {
                headers: { 'access_token': process.env.ASAAS_API_KEY }
            });
            totalInstallments = installmentDetails.data.installmentCount;
        }

        const customerResponse = await axios.get(`https://sandbox.asaas.com/api/v3/customers/${paymentData.customer}`, {
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

