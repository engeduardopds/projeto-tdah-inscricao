// Importa a biblioteca axios para fazer requisições HTTP
const axios = require('axios');

// --- ESTRUTURA DE PREÇOS OTIMIZADA ---
// BOLETO será usado para a opção "Boleto ou PIX"
const COURSE_PRICES = {
    Online: {
        BOLETO: 800.00,
        CREDIT_CARD: {
            1: 830.00,
            2: 830.97,
            3: 831.48,
            4: 831.99,
            5: 832.49,
            6: 832.99,
        }
    },
    Presencial: {
        BOLETO: 900.00,
        CREDIT_CARD: {
            1: 930.00,
            2: 934.59,
            3: 935.09,
            4: 935.60,
            5: 936.11,
            6: 936.61,
        }
    }
};

const ACCEPTED_CONTRACT_VERSION = 'v1.0';
const ACCEPTED_CONTRACT_HASH = '88559760E4DAF2CEF94D9F5B7069CBCC9A5196106CD771227DB2500EFFBEDD0E';

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    try {
        const data = JSON.parse(event.body);
        const { name, email, cpf, phone, modality, contract, contractVersion, contractHash, installments, paymentMethod } = data;

        // Validação dos dados recebidos
        if (!name || !email || !cpf || !phone || !modality || !paymentMethod) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Todos os campos são obrigatórios.' }) };
        }
        if (!contract || contractVersion !== ACCEPTED_CONTRACT_VERSION || contractHash !== ACCEPTED_CONTRACT_HASH) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Você deve aceitar a versão mais recente do contrato.' }) };
        }

        const installmentCount = parseInt(installments, 10) || 1;

        // Lógica para obter o preço correto
        let coursePrice;
        const pricesForModality = COURSE_PRICES[modality];

        if (!pricesForModality) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Modalidade de curso inválida.' }) };
        }

        if (paymentMethod === 'CREDIT_CARD') {
            coursePrice = pricesForModality.CREDIT_CARD[installmentCount];
        } else {
            coursePrice = pricesForModality[paymentMethod]; // Irá buscar o preço de BOLETO
        }
        
        if (!coursePrice) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Opção de pagamento ou parcela inválida.' }) };
        }

        if (installmentCount > 6) {
             return { statusCode: 400, body: JSON.stringify({ error: 'O número máximo de parcelas é 6.' }) };
        }
        if (installmentCount > 1 && paymentMethod !== 'CREDIT_CARD') {
            return { statusCode: 400, body: JSON.stringify({ error: 'Parcelamento só é permitido para Cartão de Crédito.' }) };
        }

        const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
        if (!ASAAS_API_KEY) {
            throw new Error("Chave da API do Asaas não configurada.");
        }

        const asaasApiUrl = 'https://sandbox.asaas.com/api/v3/payments';
        const today = new Date();
        const dueDate = new Date(today.setDate(today.getDate() + 5)).toISOString().split('T')[0];

        const payload = {
            customer: { name, email, cpfCnpj: cpf, mobilePhone: phone },
            billingType: paymentMethod, // Agora será BOLETO ou CREDIT_CARD
            value: coursePrice,
            dueDate: dueDate,
            description: `Inscrição no curso "Fazendo as Pazes com o seu TDAH" - Modalidade ${modality}`,
            externalReference: `inscricao-tdah-${new Date().getTime()}`,
            callback: {
                successUrl: `${process.env.URL}/obrigado/`,
                autoRedirect: true,
            },
            remoteIp: event.headers['x-nf-client-connection-ip'],
        };

        if (installmentCount > 1) {
            payload.installmentCount = installmentCount;
            payload.installmentValue = parseFloat((coursePrice / installmentCount).toFixed(2));
        }

        const response = await axios.post(asaasApiUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'access_token': ASAAS_API_KEY,
            },
        });
        
        return {
            statusCode: 200,
            body: JSON.stringify({ paymentUrl: response.data.invoiceUrl }),
        };

    } catch (error) {
        console.error('Erro ao criar checkout:', error.response ? error.response.data : error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Não foi possível gerar o link de pagamento. Tente novamente mais tarde.' }),
        };
    }
};

