RideFleet

Sistema distribuído para gerenciamento de corridas desenvolvido para a disciplina SIN142 - Sistemas Distribuídos.

O projeto simula o funcionamento de uma plataforma de transporte semelhante ao Uber, onde diferentes grupos de servidores competem por corridas enviadas por um Core central através de um mecanismo de leilão distribuído.

📌 Objetivos
Implementar um sistema distribuído tolerante a falhas.
Realizar comunicação assíncrona utilizando RabbitMQ.
Utilizar banco de dados PostgreSQL para persistência.
Implementar relógios lógicos de Lamport.
Simular o ciclo completo de uma corrida.
Monitorar filas e serviços.
Executar múltiplas instâncias utilizando Docker.

🔄 Fluxo do Sistema
O RideFleet Core envia uma solicitação de corrida.
O grupo recebe a corrida.
É calculada uma proposta.
A proposta é enviada ao Core.
Caso vencedora, a corrida é atribuída ao grupo.
O status da corrida é atualizado.
Eventos são registrados no banco de dados.
Mensagens são processadas pelo RabbitMQ.

▶️ Executando

Suba todos os containers:

docker compose up --build
