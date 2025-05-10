const { createBot, createProvider, createFlow, addKeyword } = require('@bot-whatsapp/bot');
const schedule = require('node-schedule');
const QRPortalWeb = require('@bot-whatsapp/portal');
const BaileysProvider = require('@bot-whatsapp/provider/baileys');
const MongoAdapter = require('@bot-whatsapp/database/mongo');
const { delay } = require('@whiskeysockets/baileys');
const fetch = require('node-fetch');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const { GoogleGenerativeAI } = require('@google/generative-ai');
const MONGO_DB_URI = 'mongodb://0.0.0.0:27017';
const MONGO_DB_NAME = 'db_bot';
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

const SPEECHMATICS_API_KEY = 'c5s2esguU4S7V0ddJHcZWQP8YYzf3ZaO';

const API_KEY = 'AIzaSyAqqi5B1wD5fw210ggLwq6VvbFUXzYVDcQ';
const MODEL = 'gemini-2.0-flash';

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL });


const normalizeText = (text) =>
    text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .toLowerCase();

const normalizeKeywords = (keywords) => keywords.map(normalizeText);

const procesarAudioYTranscribir = async (audioMessage, sock) => {
    try {
        console.log("📥 Descargando mensaje de audio...");
        if (!fs.existsSync(TEMP_AUDIO_DIR)) {
            fs.mkdirSync(TEMP_AUDIO_DIR);
        }

        const archivoAudio = path.join(TEMP_AUDIO_DIR, `audio_${Date.now()}.ogg`);
        await downloadMediaMessage(audioMessage, 'buffer', {}, { sock }).then(buffer => {
            fs.writeFileSync(archivoAudio, buffer);
        });

        console.log("🎙️ Convirtiendo audio a formato compatible...");
        const archivoConvertido = archivoAudio.replace('.ogg', '.wav');
        await new Promise((resolve, reject) => {
            ffmpeg(archivoAudio)
                .toFormat('wav')
                .on('end', () => resolve())
                .on('error', err => reject(err))
                .save(archivoConvertido);
        });

        console.log("📝 Enviando audio para transcripción...");
        const response = await axios.post(
            'https://asr.api.speechmatics.com/v2/jobs',
            {
                config: { type: "transcription", transcription_config: { language: "es" } },
                audio_file: fs.createReadStream(archivoConvertido)
            },
            { headers: { Authorization: `Bearer ${SPEECHMATICS_API_KEY}` } }
        );

        console.log("✅ Transcripción completada.");
        return response.data.results[0].alternatives[0]?.transcript || "No se pudo transcribir el mensaje.";
    } catch (error) {
        console.error('❌ Error al transcribir el audio:', error.message);
        return "No pude transcribir el mensaje de audio. Por favor, inténtalo de nuevo.";
    } finally {
        // Limpieza de archivos temporales
        if (fs.existsSync(TEMP_AUDIO_DIR)) {
            fs.rmSync(TEMP_AUDIO_DIR, { recursive: true, force: true });
        }
    }
};

const contactos = [
    { nombre: "vixc", numero: "593991102959" },
    { nombre: "Mery", numero: "593987096243" }

]
const sesionesChat = {};

const flujoRespuestaIA = addKeyword("")
  .addAction(async (ctx, { flowDynamic }) => {
    const pregunta = ctx.body?.toLowerCase();
   
    
    // CONTEXTO personalizado
    const contexto = `
Eres un asistente experto en productos de limpieza de la empresa Smartlink.
Responde de forma breve y clara sobre estos productos. No inventes respuestas. No hables de temas fuera de limpieza.

Catálogo:
Crema Exfoliante Cuerpo, Manos y Pies: Exfolia y humecta la piel. Precio: $5.00 (400 ml), $10.00 (1000 ml), $35.00 (4500 ml). sin fragancia
Crema Exfoliante para Rostro: Limpia profundamente y remueve células muertas del rostro. Precio: $3.00 (100 ml)
Crema Hidratación Cuerpo, Manos y Pies: Hidrata y nutre la piel seca o maltratada. Precio: $6.00 (400 ml), $11.00 (1000 ml)
Crema Hidratación Intensiva para Cabello: Repara y nutre cabello dañado o maltratado. Precio: $7.00 (400 ml), $11.00 (1000 ml). sin fragancia
Almoral Crema Hidratante: Hidrata la piel dejándola suave y tersa. Precio: $2.00 (130 grs), $5.00 (450 grs)
Crema Limpiadora de Superficie: Para limpiar y proteger diversas superficies del hogar. Precio: $3.00 (330 grs), $9.00 (1100 grs)
Jabón Corporal C/Aloevera: Limpia y humecta la piel con propiedades del aloe vera. Precio: $2.00 (370 ml), $4.00 (1L), $12.00 (4L), $55.00 (20L). fragancia Avena
Jabón Antibacterial: Elimina gérmenes y bacterias de las manos y cuerpo. Precio: $1.00 (370 ml), $2.00 (1L), $7.00 (4L), $30.00 (20L). Frangancias: "Coco","Mandarina","Manzana verde","Manzanilla"
Gel Antibacterial: Limpieza de manos sin agua. Precio: $2.00 (370 ml), $4.00 (1L), $14.00 (4L). sin fragancia
Gel Mentolado: Gel refrescante con aroma a mentol para masajes. Precio: $7.00 (1L), $25.00 (4L)
Shampoo de Avena: Limpia y nutre el cabello con propiedades de la avena. Precio: $2.00 (370 ml), $3.50 (750 ml), $4.00 (1L), $12.00 (4L), $55.00 (20L). Fragancia avena
Shampoo Antiresiduo: Elimina acumulación de productos en el cabello. Precio: $1.50 (370 ml), $2.50 (1L), $8.00 (4L), $35.00 (20L). Fragancia cítrica
Shampoo con Aloe Vera: Limpia y fortalece el cabello con propiedades del aloe vera. Precio: $2.00 (370 ml), $3.50 (750 ml), $4.00 (1L), $12.00 (4L), $55.00 (20L). Fragancia frutal
Shampoo Aloe Vera sin Sal: Ideal para cabellos tratados químicamente, sin sal. Precio: $3.00 (370 ml), $6.00 (750 ml), $7.00 (1L), $20.00 (4L), $80.00 (20L). Fragancia manzanilla y miel
Alcohol Común 70%: Desinfectante para superficies y manos. Precio: $3.00 (1L), $10.00 (4L), $45.00 (20L)
Alcohol Mentolado 70% Menticol: Desinfectante con aroma refrescante a mentol. Precio: $3.50 (1L), $12.00 (4L), $50.00 (20L)
Alcohol Común 96%: Para desinfección y uso médico. Precio: $4.00 (1L), $13.00 (4L), $60.00 (20L)
Alcohol Industrial 98%: Para uso industrial y limpieza profunda. Precio: $5.50 (1L), $17.00 (4L), $80.00 (20L)
Limpia Vidrio: Limpia vidrios y espejos sin dejar marcas. Precio: $2.00 (600 ml spray), $2.00 (1L), $6.00 (4L), $25.00 (20L). sin fragancia
Desinfectante: Elimina bacterias y gérmenes de superficies. Precio: $1.50 (600 ml), $1.50 (1L), $5.00 (4L), $22.00 (20L). tiene las siguientes fragancias:"Alegría","Árbol de navidad","Bambú","Bouquet","Cariño","Cerezo","Chavela","Cielo","Eucalipto","Floral","Lavanda","Mango","Manzana Canela","Manzana verde","Maracuyá", "Navidad","Pasión","Pera-Manzana"
Desinfectante Cera: Desinfecta y da brillo a superficies. Precio: $3.00 (1L), $9.00 (4L), $40.00 (20L). tiene  las siguientes fragancias:"Alegría", "Almendra","Árbol de Navidad","Avena", "Bambú", "Bastón de Navidad", 
                    "Brave Musk", "Brizza", "Bombum", "Bosque", "Bouquet", "Café", "Cariño", 
                    "Carro nuevo", "Cerezo", "Chavela", "Cherry", "Chocolate caliente", "Cielo", "Coco", 
                    "Eucalipto", "Floral", "Fresa", "Galleta de jengibre", "Gentleman", "Lavanda", 
                    "Limón", "Mandarina", "Mango", "Manzana canela", "Manzana verde", "Manzanilla", 
                    "Manzanilla y miel", "Maracuyá", "Menta", "Naranja", "Navidad", "Nochebuena", 
                    "Ortiga", "Pan de Pascua", "Pasión", "Pera", "Pera-manzana", "Perla", "Pitahaya", 
                    "Ponche", "Sándalo", "Sandía", "Stella", "Tofee", "Uva", "Vainilla", 
                    "Vainilla Oriental", "Victoria Amor"
Desengrasante Biodegradable: Elimina grasa respetando el medio ambiente. Precio: $2.00 (600 ml), $2.00 (1L), $6.00 (4L), $25.00 (20L)
Desengrasante Industrial: Elimina grasa de cocina, horno, campana y parrilla. Precio: $3.50 (1L),r $11.00 (4L), $50.00 (20L)
Desengrasante para Mecánico: Especial para remover grasa y aceite de motores. Precio: $2.50 (1L), $8.00 (4L), $35.00 (20L)
Detergente Líquido para Ropa: Para lavar ropa a mano o en lavadora. Precio: $2.50 (1L), $9.00 (4L), $40.00 (20L). fragancia Perla
Difusores electricos: Para aromatizar espacios. Precio: $20.00.
Blanqueador para Ropa Base Cloro: Blanquea y desinfecta la ropa. Precio: $2.00 (1L), $5.00 (4L), $22.00 (20L)
Blanqueador de Ropa en Polvo: Elimina manchas difíciles. Precio: $3.50 (450 grs), $9.00 (1150 grs)
Suavizante de Ropa: Deja la ropa suave y perfumada. Precio: $2.50 (1L), $9.00 (4L), $40.00 (20L). Fragancia Perla
Cloro 5%: Para desinfección general. Precio: $1.00 (1L), $3.00 (4L), $13.00 (20L). sin fragancia
Cloro 10%: Mayor concentración para limpieza profunda. Precio: $2.00 (1L), $6.00 (4L), $26.00 (20L). sin fragancia
Cloro Jabonoso: Limpia y desinfecta baños, pisos y cocinas. Precio: $2.00 (1L), $4.50 (4L), $20.00 (20L). sin fragancia
Lavaplatos en Crema: Limpia y desengrasa platos y utensilios. Precio: $2.25 (800 gr), $15.00 (7 kls). fragancia limon
Lavaplatos Líquido: Para lavar platos a mano. Precio: $2.50 (1L), $8.00 (4L), $35.00 (20L). fragancia Naranja
Fragancia Automotriz: Aroma duradero para vehículos. Precio: $1.50 (8 ml), $6.00 (120 ml). Tiene las siguientes fragancias:"Alegría", "Almendra","Árbol de Navidad","Avena", "Bambú", "Bastón de Navidad", 
                    "Brave Musk", "Brizza", "Bombum", "Bosque", "Bouquet", "Café","canela", "Cariño", 
                    "Carro nuevo", "Cerezo", "Chavela", "Cherry", "Chocolate caliente", "Cielo", "Coco", 
                    "Eucalipto", "Floral", "Fresa", "Galleta de jengibre", "Gentleman", "Lavanda", 
                    "Limón", "Mandarina", "Mango", "Manzana canela", "Manzana verde", "Manzanilla", 
                    "Manzanilla y miel", "Maracuyá", "Menta", "Naranja", "Navidad", "Nochebuena", 
                    "Ortiga", "Pan de Pascua", "Pasión", "Pera", "Pera-manzana", "Perla", "Pitahaya", 
                    "Ponche", "Sándalo", "Sandía", "Stella", "Tofee", "Uva", "Vainilla", 
                    "Vainilla Oriental", "Victoria Amor","X-más"

Fragancia para Difusor: Recarga para difusores. Precio: $3.00 (20 ml), $12.00 (120 ml). tiene las siguientes fragancias:
                    "Alegría", "Almendra","Árbol de Navidad","Avena", "Bambú", "Bastón de Navidad", 
                    "Brave Musk", "Brizza", "Bombum", "Bosque", "Bouquet", "Café", "Cariño", 
                    "Carro nuevo", "Cerezo", "Chavela", "Cherry", "Chocolate caliente", "Cielo", "Coco", 
                    "Eucalipto", "Floral", "Fresa", "Galleta de jengibre", "Gentleman", "Lavanda", 
                    "Limón", "Mandarina", "Mango", "Manzana canela", "Manzana verde", "Manzanilla", 
                    "Manzanilla y miel", "Maracuyá", "Menta", "Naranja", "Navidad", "Nochebuena", 
                    "Ortiga", "Pan de Pascua", "Pasión", "Pera", "Pera-manzana", "Perla", "Pitahaya", 
                    "Ponche", "Sándalo", "Sandía", "Stella", "Tofee", "Uva", "Vainilla", 
                    "Vainilla Oriental", "Victoria Amor"

Fragancia de Varilla Bambu: Aromatiza espacios mediante varillas. Precio: $4.00 (50 ml), $6.00 (120 ml). Tiene las siguientes fragancias: "Alegría", "Almendra","Árbol de Navidad","Avena", "Bambú", "Bastón de Navidad", 
                    "Brave Musk", "Brizza", "Bombum", "Bosque", "Bouquet", "Café","Canela", "Cariño", 
                    "Carro nuevo", "Cerezo", "Chavela", "Cherry", "Chocolate caliente", "Cielo", "Coco", 
                    "Eucalipto", "Floral", "Fresa", "Galleta de jengibre", "Gentleman", "Lavanda", 
                    "Limón", "Mandarina", "Mango", "Manzana canela", "Manzana verde", "Manzanilla", 
                    "Manzanilla y miel", "Maracuyá", "Menta", "Naranja", "Navidad", "Nochebuena", 
                    "Ortiga", "Pan de Pascua", "Pasión", "Pera", "Pera-manzana", "Perla", "Pitahaya", 
                    "Ponche", "Sándalo", "Sandía", "Stella", "Tofee", "Uva", "Vainilla", 
                    "Vainilla Oriental", "Victoria Amor"

Fragancia en Splash: Aroma en spray para textiles. Precio: $4.00 (125 ml spray). Tiene las siguientes fragancias:"Alegría", "Almendra","Árbol de Navidad","Avena", "Bambú", "Bastón de Navidad", 
                    "Brave Musk", "Brizza", "Bombum", "Bosque", "Bouquet", "Café","canela", "Cariño", 
                    "Carro nuevo", "Cerezo", "Chavela", "Cherry", "Chocolate caliente", "Cielo", "Coco", 
                    "Eucalipto", "Floral", "Fresa", "Galleta de jengibre", "Gentleman", "Lavanda", 
                    "Limón", "Mandarina", "Mango", "Manzana canela", "Manzana verde", "Manzanilla", 
                    "Manzanilla y miel", "Maracuyá", "Menta", "Naranja", "Navidad", "Nochebuena", 
                    "Ortiga", "Pan de Pascua", "Pasión", "Pera", "Pera-manzana", "Perla", "Pitahaya", 
                    "Ponche", "Sándalo", "Sandía", "Stella", "Tofee", "Uva", "Vainilla", 
                    "Vainilla Oriental", "Victoria Amor","X-más"

Fragancia para Rociadores y Splash: Aromas para ambientes. Precio: $3.00 (120 ml), $5.50 (240 ml), $10.00 (500 ml), $18.00 (1L), $65.00 (4L)
Almoral Líquido para Spray con Fragancia: Aromatizador ambiental. Precio: $3.00 (220 ml), $7.00 (1L), $25.00 (4L)
Almoral Para Llantas: Da brillo y protección a las llantas. Precio: $4.00 (220 ml)
Amonio Cuaternario: Desinfectante de amplio espectro. Precio: $3.00 (1L), $10.00 (4L), $45.00 (20L). Sin fragancia
Antisarro: Elimina sarro y residuos de minerales. Precio: $3.50 (1L), $12.00 (4L). sin fragancia
Bicarbonato de Sodio: Múltiples usos de limpieza. Precio: $4.00 (500 grs). sin fragancia
Cera Líquida: Protege y da brillo a superficies. Precio: $3.00 (1L), $10.00 (4L), $45.00 (20L)
Velas para Masaje Mentolada: Para masajes relajantes. Precio: $6.00 (100 ml), $8.50 (150 ml)
Fundas para Basura (varios tamaños): Para recolección de desechos. Precios desde $0.60 hasta $3.70 según tamaño y cantidad. 

Pregunta del cliente:
"${pregunta}"

Responde solo si la pregunta está relacionada con estos productos o limpieza. Sé breve, directo y claro.
si te piden el catálogo manda este mensaje:Sigue este enlace para ver nuestro catálogo en WhatsApp: https://wa.me/c/593998081000
si te piden informacion o quieren comprar responde claro
si te piden hablar con un encargado manda este mensaje:Un momento, por favor... Gracias por contactar a un encargado. Estará contigo en breve, normalmente en unos minutos.
si te saludan respondeles y si te preguntan de una vez sobre algo solo responde lo que te preguntan
si se realizan entregas a domicilio solo a algunos sectores de la ciudad de Quito, si no se puede realizar la entrega a domicilio se les informa que deben pasar a retirar el pedido por la oficina ubicada en la av. real audiencia con destacamento bejucal
solo se realizan entregas a domicilio desde carcelen hasta la patria elejido
si no sabes que responder, responde: "🤖 No tengo información sobre eso. En un momento te paso con el encargado para que responda a tu duda"
ademas manda emojis relacionados a la limpieza y productos de limpieza
si confirman el pedido y no te han mandado pide que te manden su ubicacion por google maps para coordinar la entrega o aviseme si desea pasar a retirar, tambien metodo con el que va a pagar
aceptamos como metodo de pago trasnferencia, deUna,efectivo"
si es un clientae nuevo debe debe pagar por adelantado, si es un cliente frecuente puede pagar al momento de la entreg, preguntale si es cliente nuevo o frecuente
cuando confirmen que van a pagar dile que lo vas a poner en contacto con el encargado para que coordine la entrega
hacemos marca blanca de los productos, si preguntan por eso, dile que si hacemos marca
so te preguntan por descuentos solo hay para las personas que vengan a comprar al local ya sea al mayor o no, tienen el 20% de descuento
no hay descuentos al mayor, una compra se considera por mayor de 100 dolares en adelante 
los envios son gratis siempre y cuando este en el sector de carcelen a la patria El Ejido
si no esta en los sectores se hacen envios a otros lugares siempre y cuando la compra sea mayor a 100 dolares pero estos deben ser pagados por adelantado
los distribuidores tienes un descuento 
aunque la fragancia sea diferente el producto cuesta lo mismo
los difusores y fundas no tienen fragancia porque es plastico por si alguien te pregunta
suavizante y detergente son hipoalargénico
nuestra empresa no es nueva, tenemos 8 años en el mercado
no hay limites de compra, puedes comprar lo que desees
podemos fabricar fragancias personalizadas siempre y cuando las compren al mayor
el horario de atencion en el local es de 10am a 6pm de lunes a sabado
no se puede pagar en cuotas, solo al contado
en algunas temporadas tenemos descuentos y ofertas de algunos productos, actualmente solo tenemos la oferta de 4 fragancias de difusor de 20ml por el precio de 10 dolares y 3 fragancias de bambu de 50 ml por 10 dolares, esta oferta es por el dia de la madre






`;

try {
    const numero = ctx.from;

    if (!sesionesChat[numero]) {
    // Inicia o reutiliza el chat por número
    
        const chat = await genAI.getGenerativeModel({ model: MODEL }).startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: "Eres un asistente experto en productos de limpieza de la empresa Smartlink." }]
                },
                {
                    role: "model",
                    parts: [{ text: "¡Hola! ¿En qué puedo ayudarte hoy sobre nuestros productos de limpieza?" }]
                }
            ],
            generationConfig: {
                maxOutputTokens: 1000,
            },
        });
        sesionesChat[numero] = chat;
        
    }

    const chat = sesionesChat[numero];
    const result = await chat.sendMessage(`${contexto}`);
    const response = await result.response;
    const texto = response.text();
    if (ctx.message?.message?.audioMessage) {
        console.log("🎧 Mensaje de audio recibido.");
        texto = await procesarAudioYTranscribir(ctx.message, ctx.sock);
    }
    await flowDynamic(texto || '🤖 No encontré una respuesta.');
    console.log("📨 Texto enviado a Gemini:", texto);
} catch (error) {
    console.error('Error con Gemini:', error);
    await flowDynamic('⚠️ Lo siento, ocurrió un error al responder tu pregunta.');
}
});

  
const main = async () => {
    const adaptorDB = new MongoAdapter({
        dbUri: MONGO_DB_URI,
        dbName: MONGO_DB_NAME,
    });

    const adaptorFlow = createFlow([flujoRespuestaIA]);
    const adaptorProvider = createProvider(BaileysProvider);

    createBot({
        flow: adaptorFlow,
        provider: adaptorProvider,
        database: adaptorDB,
    }).then(() => {
        console.log('Bot iniciado correctamente y conectado a WhatsApp');
    });

    QRPortalWeb();
    const provider = adaptorProvider;
    const fechaEnvio = new Date('2025-05-08T21:10:00');
    const ahora = new Date();
    const diferencia = fechaEnvio - ahora;
    console.log('⏳ Esperando conexión con WhatsApp...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    if (diferencia > 0) {
        console.log(`El mensaje se enviará en ${diferencia / 1000} segundos`);
    
        // Usamos setTimeout para ejecutar el código de envío después de la diferencia de tiempo calculada
        setTimeout(async () => {
            console.log('🚀 Enviando mensajes masivos...');
            
            for (const numero of contactos) {
                const jid = `${numero.numero}@s.whatsapp.net`;
                const mensaje = `¡Hola ${numero.nombre}! 🎉 Mira esta promo en productos de limpieza.`;
            
                // Verificar si quieres enviar una imagen o solo un mensaje de texto
                const enviarConImagen = true; // Cambiar a 'false' cuando no quieras enviar imagen
            
                try {
                    if (enviarConImagen) {
                        // Enviar mensaje con imagen
                        const imagePath = "C:/Users/Syslan/Pictures/images.jpeg";
                        await provider.sendMedia(jid, imagePath, mensaje);
                        console.log(`✅ Imagen enviada a: ${numero.nombre} (${numero.numero})`);
                    } else {
                        // Enviar solo mensaje de texto
                        await provider.sendText(jid, mensaje);
                        console.log(`✅ Mensaje enviado a: ${numero.nombre} (${numero.numero})`);
                    }
                } catch (error) {
                    console.error(`❌ Error al enviar a ${numero.numero}:`, error.message);
                }
            
                await new Promise(resolve => setTimeout(resolve, 60000)); // Esperar 60 segundos
            }
            
            console.log('📤 Mensajería masiva finalizada.');
            process.exit(0);  // Detener el proceso después de enviar los mensajes
        }, diferencia);
    } else {
        console.log("La fecha y hora ya ha pasado.");
    }
};



main();
