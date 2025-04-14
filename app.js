require('dotenv').config();
const { createBot, createProvider, createFlow, addKeyword } = require('@bot-whatsapp/bot');

const QRPortalWeb = require('@bot-whatsapp/portal');
const BaileysProvider = require('@bot-whatsapp/provider/baileys');
const MongoAdapter = require('@bot-whatsapp/database/mongo');
const express = require('express'); // Importamos Express

// Variables de entorno
const MONGO_DB_URI = process.env.MONGO_DB_URI || 'mongodb://0.0.0.0:27017';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'db_bot';
const PORT = process.env.PORT || 10000; // Puerto configurado para Render o local

// Inicializamos Express
const app = express();

// Flujos secundarios
const flowSecundario = addKeyword(['2', 'siguiente']).addAnswer(['📄 Aquí tenemos el flujo secundario']);

const flowDocs = addKeyword(['doc', 'documentacion', 'documentación']).addAnswer(
    [
        '📄 Aquí encontras la documentación recuerda que puedes mejorarla',
        'https://bot-whatsapp.netlify.app/',
        '\n*2* Para siguiente paso.',
    ],
    null,
    null,
    [flowSecundario]
);

const flowTuto = addKeyword(['tutorial', 'tuto']).addAnswer(
    [
        '🙌 Aquí encontras un ejemplo rápido',
        'https://bot-whatsapp.netlify.app/docs/example/',
        '\n*2* Para siguiente paso.',
    ],
    null,
    null,
    [flowSecundario]
);

const flowGracias = addKeyword(['gracias', 'grac']).addAnswer(
    [
        '🚀 Puedes aportar tu granito de arena a este proyecto',
        '[*opencollective*] https://opencollective.com/bot-whatsapp',
        '[*buymeacoffee*] https://www.buymeacoffee.com/leifermendez',
        '[*patreon*] https://www.patreon.com/leifermendez',
        '\n*2* Para siguiente paso.',
    ],
    null,
    null,
    [flowSecundario]
);

const flowDiscord = addKeyword(['discord']).addAnswer(
    ['🤪 Únete al discord', 'https://link.codigoencasa.com/DISCORD', '\n*2* Para siguiente paso.'],
    null,
    null,
    [flowSecundario]
);

const flowPrincipal = addKeyword(['hola', 'ole', 'alo'])
    .addAnswer('🙌 Hola bienvenido a este *Chatbot*')
    .addAnswer(
        [
            'te comparto los siguientes links de interés sobre el proyecto',
            '👉 *doc* para ver la documentación',
            '👉 *gracias*  para ver la lista de videos',
            '👉 *discord* unirte al discord',
        ],
        null,
        null,
        [flowDocs, flowGracias, flowTuto, flowDiscord]
    );

// Inicializamos el bot
const main = async () => {
    const adapterDB = new MongoAdapter({
        dbUri: MONGO_DB_URI,
        dbName: MONGO_DB_NAME,
    });
    const adapterFlow = createFlow([flowPrincipal]);
    const adapterProvider = createProvider(BaileysProvider);

    const bot = createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });

    let qrCodeURL = ''; // Variable para almacenar la URL del QR

    // Escuchamos el evento "qr" para capturar el código QR
    bot.start().then(() => {
        bot.on('qr', (qr) => {
            qrCodeURL = qr; // Guardamos el QR en la variable
            console.log('QR generado:', qr);
        });
    });

    // Ruta principal para mostrar el QR en el navegador
    app.get('/', (req, res) => {
        if (qrCodeURL) {
            res.send(`
                <h1>Escanea este código QR para iniciar sesión en WhatsApp</h1>
                <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCodeURL)}&size=300x300" alt="QR Code">
            `);
        } else {
            res.send('<h1>El código QR aún no está disponible. Por favor, espera unos segundos...</h1>');
        }
    });

    // Iniciamos el servidor en el puerto configurado
    app.listen(PORT, () => {
        console.log(`Servidor escuchando en http://localhost:${PORT}`);
    });

    QRPortalWeb(); // Portal QR opcional
};

main();