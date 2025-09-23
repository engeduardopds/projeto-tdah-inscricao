// Importa a biblioteca axios para fazer requisições HTTP
const axios = require('axios');

// Estrutura de preços detalhada
const coursePrices = {
    Online: { 
        BOLETO: 800.00, 
        CREDIT_CARD: { 1: 830.00, 2: 830.97, 3: 831.48, 4: 831.99, 5: 832.49, 6: 832.99 }
    },
    Presencial: { 
        BOLETO: 900.00, 
        CREDIT_CARD: { 1: 930.00, 2: 934.59, 3: 935.09, 4: 935.60, 5: 936.11, 6: 936.61 }
    }
};

// Versão do contrato que esperamos que o usuário aceite
const ACCEPTED_CONTRACT_VERSION = 'v1.0';
const ACCEPTED_CONTRACT_HASH = '88559760E4DAF2CEF94D9F5B7069CBCC9A5196106CD771227DB2500EFFBEDD0E';


exports.handler = async (event) => {
    // 1. Validação inicial
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    try {
        const data = JSON.parse(event.body);
        const { 
            name, email, cpf, phone, cep, address, addressNumber, complement, city,
            modality, paymentMethod, installments, contract, contractVersion, contractHash 
        } = data;

        // 2. Validação dos dados
        if (!name || !email || !cpf || !phone || !cep || !address || !addressNumber || !city || !modality || !paymentMethod || !installments) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Todos os campos obrigatórios devem ser preenchidos.' }) };
        }
        if (!contract || contractVersion !== ACCEPTED_CONTRACT_VERSION || contractHash !== ACCEPTED_CONTRACT_HASH) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Você deve aceitar a versão mais recente do contrato.' }) };
        }

        // 3. Lógica de Preços
        const numInstallments = parseInt(installments, 10);
        let coursePrice;
        if (paymentMethod === 'CREDIT_CARD') {
            coursePrice = coursePrices[modality]?.CREDIT_CARD?.[numInstallments];
        } else {
            coursePrice = coursePrices[modality]?.BOLETO;
        }

        if (!coursePrice) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Combinação de curso, pagamento ou parcelamento inválida.' }) };
        }

        // 4. Preparação para a chamada à API do Asaas
        const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
        if (!ASAAS_API_KEY) throw new Error("Chave da API do Asaas não configurada.");
        
        const asaasApiUrl = 'https://sandbox.asaas.com/api/v3/payments';
        const today = new Date();
        const dueDate = new Date(today.setDate(today.getDate() + 5)).toISOString().split('T')[0];
        
        const payload = {
            customer: {
                name,
                email,
                cpfCnpj: cpf,
                mobilePhone: phone,
                postalCode: cep,
                address,
                addressNumber,
                complement,
                province: city.split(',')[1]?.trim() || '', // Extrai o bairro se houver
            },
            billingType: paymentMethod,
            value: coursePrice,
            dueDate: dueDate,
            description: `Inscrição no curso "Fazendo as Pazes com o seu TDAH" - Modalidade ${modality}`,
            callback: {
                successUrl: `${process.env.URL}/obrigado/`,
                autoRedirect: true,
            },
            remoteIp: event.headers['x-nf-client-connection-ip'],
        };

        if (paymentMethod === 'CREDIT_CARD' && numInstallments > 1) {
            payload.installmentCount = numInstallments;
            payload.installmentValue = parseFloat((coursePrice / numInstallments).toFixed(2));
        }

        // 5. Chamada à API do Asaas
        const response = await axios.post(asaasApiUrl, payload, {
            headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_API_KEY },
        });
        
        // 6. Retorno do sucesso
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

