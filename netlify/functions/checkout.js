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

const ACCEPTED_CONTRACT_VERSION = 'v1.0';
const ACCEPTED_CONTRACT_HASH = '88559760E4DAF2CEF94D9F5B7069CBCC9A5196106CD771227DB2500EFFBEDD0E';


exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    try {
        const data = JSON.parse(event.body);
        const { 
            name, email, cpf, phone, 
            cep, address, addressNumber, complement, bairro, city,
            modality, paymentMethod, installments,
            objective, source, 
            contract, contractVersion, contractHash 
        } = data;

        // Validação dos dados essenciais
        if (!name || !email || !cpf || !phone || !cep || !address || !addressNumber || !bairro || !city || !modality || !paymentMethod || !installments || !objective || !source) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Todos os campos são obrigatórios.' }) };
        }

        // Validação do contrato
        if (!contract || contractVersion !== ACCEPTED_CONTRACT_VERSION || contractHash !== ACCEPTED_CONTRACT_HASH) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Você deve aceitar a versão mais recente do contrato.' }) };
        }

        // Determinar o preço
        let coursePrice;
        const pricesForModality = coursePrices[modality];
        if (!pricesForModality) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Modalidade de curso inválida.' }) };
        }

        if (paymentMethod === 'CREDIT_CARD') {
            coursePrice = pricesForModality.CREDIT_CARD[installments];
        } else { // BOLETO
            coursePrice = pricesForModality.BOLETO;
        }

        if (!coursePrice) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Opção de pagamento ou parcelamento inválida.' }) };
        }

        const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
        if (!ASAAS_API_KEY) throw new Error("Chave da API do Asaas não configurada.");
        
        const asaasApiUrl = 'https://sandbox.asaas.com/api/v3';
        const today = new Date();
        const dueDate = new Date(today.setDate(today.getDate() + 5)).toISOString().split('T')[0];

        // --- LÓGICA DE CRIAÇÃO DE CLIENTE E PAGAMENTO ---
        const payload = {
            billingType: paymentMethod,
            value: coursePrice,
            dueDate,
            description: `Inscrição no curso "Fazendo as Pazes com o seu TDAH" - Modalidade ${modality}`,
            externalReference: JSON.stringify({ objective, source }),
            callback: {
                successUrl: `${process.env.URL}/obrigado/`,
                autoRedirect: true,
            },
        };

        if (paymentMethod === 'CREDIT_CARD') {
            // Passo 1: Criar o cliente primeiro para obter o ID
            const customerPayload = { name, email, cpfCnpj: cpf, mobilePhone: phone, postalCode: cep, address, addressNumber, complement, province: bairro };
            const customerResponse = await axios.post(`${asaasApiUrl}/customers`, customerPayload, {
                headers: { 'access_token': ASAAS_API_KEY }
            });
            const customerId = customerResponse.data.id;

            // Passo 2: Usar o ID do cliente no payload de pagamento
            payload.customer = customerId;
            
            // --- CORREÇÃO APLICADA AQUI ---
            // Adicionar detalhes do parcelamento APENAS se for mais de 1 parcela, conforme a documentação do Asaas.
            if (installments > 1) {
                payload.installmentCount = installments;
                payload.installmentValue = parseFloat((coursePrice / installments).toFixed(2));
            }
            // Se for 1 parcela, não enviamos os campos de parcelamento. O Asaas tratará como "à vista".
            // ------------------------------------

        } else {
            // Para Boleto, podemos enviar os dados do cliente diretamente
            payload.customer = { name, email, cpfCnpj: cpf, mobilePhone: phone, postalCode: cep, address, addressNumber, complement, province: bairro };
        }
        // ----------------------------------------------------

        const response = await axios.post(`${asaasApiUrl}/payments`, payload, {
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

