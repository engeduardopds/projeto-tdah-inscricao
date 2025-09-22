// Importa a biblioteca axios para fazer requisições HTTP
const axios = require('axios');

// ATUALIZE AQUI OS VALORES REAIS DOS SEUS CURSOS
const COURSE_PRICES = {
    Online: 599.90,
    Presencial: 999.90,
};

// Versão do contrato que esperamos que o usuário aceite
const ACCEPTED_CONTRACT_VERSION = 'v1.0';
// Hash SHA-256 do arquivo contrato.pdf para garantir sua integridade
const ACCEPTED_CONTRACT_HASH = '88559760E4DAF2CEF94D9F5B7069CBCC9A5196106CD771227DB2500EFFBEDD0E';


exports.handler = async (event) => {
    // 1. Validação inicial
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Método não permitido' }),
        };
    }

    try {
        const data = JSON.parse(event.body);
        const { name, email, cpf, phone, modality, contract, contractVersion, contractHash, installments, paymentMethod } = data;

        // 2. Validação dos dados recebidos
        if (!name || !email || !cpf || !phone || !modality || !paymentMethod) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Todos os campos são obrigatórios.' }),
            };
        }

        if (!contract || contractVersion !== ACCEPTED_CONTRACT_VERSION || contractHash !== ACCEPTED_CONTRACT_HASH) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Você deve aceitar a versão mais recente do contrato.' }),
            };
        }

        const coursePrice = COURSE_PRICES[modality];
        if (!coursePrice) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Modalidade de curso inválida.' }),
            };
        }
        
        const installmentCount = parseInt(installments, 10) || 1;
        
        // 3. Lógica de Pagamento
        let billingType = paymentMethod;

        // Garante que parcelamento só seja possível com Cartão de Crédito
        if (installmentCount > 1 && billingType !== 'CREDIT_CARD') {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Parcelamento só é permitido para Cartão de Crédito.' }),
            };
        }


        // 4. Preparação para a chamada à API do Asaas
        const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
        if (!ASAAS_API_KEY) {
            throw new Error("Chave da API do Asaas não configurada.");
        }

        const asaasApiUrl = 'https://sandbox.asaas.com/api/v3/payments';

        const today = new Date();
        const dueDate = new Date(today.setDate(today.getDate() + 5)).toISOString().split('T')[0];

        // Constrói o payload base
        const payload = {
            customer: {
                name,
                email,
                cpfCnpj: cpf,
                mobilePhone: phone,
            },
            billingType: billingType,
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

        // Adiciona informações de parcelamento APENAS se for parcelado
        if (installmentCount > 1) {
            payload.installmentCount = installmentCount;
            // O Asaas exige que o valor da parcela seja informado
            payload.installmentValue = parseFloat((coursePrice / installmentCount).toFixed(2));
        }

        // 5. Chamada à API do Asaas
        const response = await axios.post(asaasApiUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'access_token': ASAAS_API_KEY,
            },
        });
        
        // 6. Retorno do sucesso com a URL de pagamento
        return {
            statusCode: 200,
            body: JSON.stringify({ paymentUrl: response.data.invoiceUrl }),
        };

    } catch (error) {
        // 7. Tratamento de erros
        console.error('Erro ao criar checkout:', error.response ? error.response.data : error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Não foi possível gerar o link de pagamento. Tente novamente mais tarde.' }),
        };
    }
};

