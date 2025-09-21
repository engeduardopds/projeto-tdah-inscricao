exports.handler = async (event) => {
    // Apenas aceitamos requisições POST do Asaas
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // 1. Validação de segurança do Webhook
        // IMPORTANTE: Configure um token no seu webhook do Asaas e guarde-o como Environment Variable
        const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;
        const receivedToken = event.headers['asaas-access-token'];

        if (!ASAAS_WEBHOOK_TOKEN || receivedToken !== ASAAS_WEBHOOK_TOKEN) {
            console.warn('Tentativa de acesso não autorizado ao webhook.');
            return { statusCode: 401, body: 'Unauthorized' };
        }
        
        const notification = JSON.parse(event.body);

        // 2. Processa o evento
        // O evento que nos interessa é quando um pagamento é confirmado ou recebido.
        if (notification.event === 'PAYMENT_CONFIRMED' || notification.event === 'PAYMENT_RECEIVED') {
            const payment = notification.payment;

            console.log(`Pagamento confirmado! ID: ${payment.id}`);
            console.log(`Cliente: ${payment.customer}`);
            
            //
            // AQUI VOCÊ COLOCA A SUA LÓGICA DE NEGÓCIO
            //
            // Exemplo:
            // 1. Buscar o cliente no seu banco de dados usando o ID `payment.customer`.
            // 2. Liberar o acesso ao curso para este cliente.
            // 3. Enviar um e-mail de boas-vindas com as instruções de acesso.
            //
            console.log(`Liberando acesso para o cliente e enviando e-mail de boas-vindas...`);

        } else {
             console.log(`Evento recebido, mas não processado: ${notification.event}`);
        }

        // 3. Retorna sucesso para o Asaas saber que recebemos a notificação
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Webhook recebido com sucesso' }),
        };

    } catch (error) {
        console.error('Erro no processamento do webhook:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Falha ao processar webhook' }),
        };
    }
};
