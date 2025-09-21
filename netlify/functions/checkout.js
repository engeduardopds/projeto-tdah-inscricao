// Importa a biblioteca axios para fazer requisições HTTP
const axios = require('axios');

// Preços dos cursos - idealmente, viriam de um banco de dados ou outra fonte segura.
const COURSE_PRICES = {
    Online: 199.90,
    Presencial: 499.90,
};

// Versão do contrato que esperamos que o usuário aceite
const ACCEPTED_CONTRACT_VERSION = 'v1.0';

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
        const { name, email, cpf, phone, modality, contract, contractVersion } = data;

        // 2. Validação dos dados recebidos
        if (!name || !email || !cpf || !phone || !modality) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Todos os campos são obrigatórios.' }),
            };
        }

        if (!contract || contractVersion !== ACCEPTED_CONTRACT_VERSION) {
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
        // IMPORTANTE: Guarde sua chave de API nas Environment Variables do Netlify!
        const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
        if (!ASAAS_API_KEY) {
            throw new Error("Chave da API do Asaas não configurada.");
        }

        // URL da API do Asaas (use a URL de produção quando estiver pronto)
        const asaasApiUrl = 'https://sandbox.asaas.com/api/v3/payments';

        const today = new Date();
        const dueDate = new Date(today.setDate(today.getDate() + 5)).toISOString().split('T')[0];

        const payload = {
            customer: {
                name,
                email,
                cpfCnpj: cpf.replace(/\D/g, ''), // Remove caracteres não numéricos do CPF
                mobilePhone: phone.replace(/\D/g, ''),
            },
            billingType: 'UNDEFINED', // Permite que o cliente escolha entre boleto, pix ou cartão
            value: coursePrice,
            dueDate: dueDate,
            description: `Inscrição no curso "Fazendo as Pazes com o seu TDAH" - Modalidade ${modality}`,
            // Você pode adicionar um ID externo para vincular ao seu sistema
            // externalReference: 'SEU_ID_INTERNO_DO_ALUNO',
        };

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
