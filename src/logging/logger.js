const lamportClock = require('../logical-clock/lamport-clock');

function structuredLog({
    nivel = 'INFO',
    evento,
    corrida_id = null,
    servico_origem = process.env.SERVICE_ID || 'grupo-a',
    estado_anterior = null,
    estado_novo = null,
    detalhes = {}
}) {

    let logicalTimestamp = null;

    try {
        logicalTimestamp = lamportClock.tick();
    } catch {
        logicalTimestamp = null;
    }

    const log = {
        timestamp: new Date().toISOString(),
        logical_timestamp: logicalTimestamp,

        nivel,
        evento,

        corrida_id,
        servico_origem,

        estado_anterior,
        estado_novo,

        detalhes
    };

    console.log(JSON.stringify(log));
}

module.exports = { structuredLog };