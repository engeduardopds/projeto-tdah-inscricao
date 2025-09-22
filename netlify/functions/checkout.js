// Importa a biblioteca axios para fazer requisições HTTP
const axios = require('axios');

// Preços dos cursos - idealmente, viriam de um banco de dados ou outra fonte segura.
const COURSE_PRICES = {
    Online: 199.90,
    Presencial: 499.90,
};

// Adicionamos o hash esperado do contrato para validação no backend.
// Este hash deve corresponder exatamente ao hash no seu arquivo index.html.
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
        // Extraímos o contractHash dos dados recebidos do formulário.
        const { name, email, cpf, phone, modality, contract, contractVersion, contractHash } = data;

        // 2. Validação dos dados recebidos
        if (!name || !email || !cpf || !phone || !modality) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Todos os campos são obrigatórios.' }),
            };
        }

        // Validação do contrato (agora com versão e hash)
        if (!contract || contractVersion !== ACCEPTED_CONTRACT_VERSION) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Você deve aceitar a versão mais recente do contrato.' }),
            };
        }
        
        // Nova validação para garantir a integridade do contrato.
        if (contractHash !== ACCEPTED_CONTRACT_HASH) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'A assinatura do contrato é inválida. Por favor, recarregue a página e tente novamente.' }),
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

        const payload = {
            customer: {
                name,
                email,
                cpfCnpj: cpf,
                mobilePhone: phone,
            },
            billingType: 'UNDEFINED',
            value: coursePrice,
            dueDate: dueDate,
            description: `Inscrição no curso "Fazendo as Pazes com o seu TDAH" - Modalidade ${modality}`,
            // --- INÍCIO DA ATUALIZAÇÃO ---
            // Adicionamos as URLs de redirecionamento para o Asaas.
            // O process.env.URL é fornecido automaticamente pelo Netlify com a URL principal do seu site.
            redirectUrl: `${process.env.URL}/obrigado/`,
            backUrl: `${process.env.URL}/cancelado/`,
            // --- FIM DA ATUALIZAÇÃO ---
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
