// Importa a biblioteca axios para fazer requisições HTTP
const axios = require('axios');
const crypto = require('crypto');

// ATUALIZE AQUI OS PREÇOS DOS SEUS CURSOS
const COURSE_PRICES = {
    Online: 249.90,
    Presencial: 599.90,
};

// ATUALIZE AQUI SE ALTERAR O PDF DO CONTRATO
const ACCEPTED_CONTRACT_VERSION = 'v1.0';
const ACCEPTED_CONTRACT_HASH = '88559760E4DAF2CEF94D9F5B7069CBCC9A5196106CD771227DB2500EFFBEDD0E';


exports.handler = async (event) => {
    // 1. Validação inicial: Apenas aceitamos requisições POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Método não permitido' }),
        };
    }

    try {
        const data = JSON.parse(event.body);
        const { name, email, cpf, phone, modality, installmentCount, contract, contractVersion, contractHash } = data;
        const remoteIp = event.headers['x-nf-client-connection-ip'];

        // 2. Validação dos dados recebidos
        if (!name || !email || !cpf || !phone || !modality || !installmentCount) {
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

        // 3. Preparação para a chamada à API do Asaas
        const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
        if (!ASAAS_API_KEY) {
            throw new Error("Chave da API do Asaas não configurada.");
        }
        
        const asaasApiUrl = 'https://sandbox.asaas.com/api/v3/payments';

        const today = new Date();
        const dueDate = new Date(today.setDate(today.getDate() + 5)).toISOString().split('T')[0];

        // Construção do payload para o Asaas
        const payload = {
            customer: {
                name,
                email,
                cpfCnpj: cpf.replace(/\D/g, ''),
                mobilePhone: phone.replace(/\D/g, ''),
            },
            billingType: 'UNDEFINED',
            value: coursePrice,
            dueDate: dueDate,
            description: `Inscrição no curso "Fazendo as Pazes com o seu TDAH" - Modalidade ${modality}`,
            remoteIp,
            callback: {
                successUrl: `${process.env.URL}/obrigado/`,
                autoRedirect: true,
            },
        };
        
        // Adiciona informações de parcelamento APENAS se for maior que 1
        if (installmentCount > 1) {
            payload.installmentCount = installmentCount;
            // Opcional: Asaas calcula o valor da parcela se não for informado, o que evita erros de arredondamento.
            // payload.installmentValue = parseFloat((coursePrice / installmentCount).toFixed(2));
        }

        // 4. Chamada à API do Asaas
        const response = await axios.post(asaasApiUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'access_token': ASAAS_API_KEY,
            },
        });
        
        // 5. Retorno do sucesso com a URL de pagamento
        return {
            statusCode: 200,
            body: JSON.stringify({ paymentUrl: response.data.invoiceUrl }),
        };

    } catch (error) {
        // 6. Tratamento de erros
        console.error('Erro ao criar checkout:', error.response ? error.response.data : error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Não foi possível gerar o link de pagamento. Tente novamente mais tarde.' }),
        };
    }
};

